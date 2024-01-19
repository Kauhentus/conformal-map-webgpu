/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./node_modules/nearley/lib/nearley.js":
/*!*********************************************!*\
  !*** ./node_modules/nearley/lib/nearley.js ***!
  \*********************************************/
/***/ (function(module) {

(function(root, factory) {
    if ( true && module.exports) {
        module.exports = factory();
    } else {
        root.nearley = factory();
    }
}(this, function() {

    function Rule(name, symbols, postprocess) {
        this.id = ++Rule.highestId;
        this.name = name;
        this.symbols = symbols;        // a list of literal | regex class | nonterminal
        this.postprocess = postprocess;
        return this;
    }
    Rule.highestId = 0;

    Rule.prototype.toString = function(withCursorAt) {
        var symbolSequence = (typeof withCursorAt === "undefined")
                             ? this.symbols.map(getSymbolShortDisplay).join(' ')
                             : (   this.symbols.slice(0, withCursorAt).map(getSymbolShortDisplay).join(' ')
                                 + " ● "
                                 + this.symbols.slice(withCursorAt).map(getSymbolShortDisplay).join(' ')     );
        return this.name + " → " + symbolSequence;
    }


    // a State is a rule at a position from a given starting point in the input stream (reference)
    function State(rule, dot, reference, wantedBy) {
        this.rule = rule;
        this.dot = dot;
        this.reference = reference;
        this.data = [];
        this.wantedBy = wantedBy;
        this.isComplete = this.dot === rule.symbols.length;
    }

    State.prototype.toString = function() {
        return "{" + this.rule.toString(this.dot) + "}, from: " + (this.reference || 0);
    };

    State.prototype.nextState = function(child) {
        var state = new State(this.rule, this.dot + 1, this.reference, this.wantedBy);
        state.left = this;
        state.right = child;
        if (state.isComplete) {
            state.data = state.build();
            // Having right set here will prevent the right state and its children
            // form being garbage collected
            state.right = undefined;
        }
        return state;
    };

    State.prototype.build = function() {
        var children = [];
        var node = this;
        do {
            children.push(node.right.data);
            node = node.left;
        } while (node.left);
        children.reverse();
        return children;
    };

    State.prototype.finish = function() {
        if (this.rule.postprocess) {
            this.data = this.rule.postprocess(this.data, this.reference, Parser.fail);
        }
    };


    function Column(grammar, index) {
        this.grammar = grammar;
        this.index = index;
        this.states = [];
        this.wants = {}; // states indexed by the non-terminal they expect
        this.scannable = []; // list of states that expect a token
        this.completed = {}; // states that are nullable
    }


    Column.prototype.process = function(nextColumn) {
        var states = this.states;
        var wants = this.wants;
        var completed = this.completed;

        for (var w = 0; w < states.length; w++) { // nb. we push() during iteration
            var state = states[w];

            if (state.isComplete) {
                state.finish();
                if (state.data !== Parser.fail) {
                    // complete
                    var wantedBy = state.wantedBy;
                    for (var i = wantedBy.length; i--; ) { // this line is hot
                        var left = wantedBy[i];
                        this.complete(left, state);
                    }

                    // special-case nullables
                    if (state.reference === this.index) {
                        // make sure future predictors of this rule get completed.
                        var exp = state.rule.name;
                        (this.completed[exp] = this.completed[exp] || []).push(state);
                    }
                }

            } else {
                // queue scannable states
                var exp = state.rule.symbols[state.dot];
                if (typeof exp !== 'string') {
                    this.scannable.push(state);
                    continue;
                }

                // predict
                if (wants[exp]) {
                    wants[exp].push(state);

                    if (completed.hasOwnProperty(exp)) {
                        var nulls = completed[exp];
                        for (var i = 0; i < nulls.length; i++) {
                            var right = nulls[i];
                            this.complete(state, right);
                        }
                    }
                } else {
                    wants[exp] = [state];
                    this.predict(exp);
                }
            }
        }
    }

    Column.prototype.predict = function(exp) {
        var rules = this.grammar.byName[exp] || [];

        for (var i = 0; i < rules.length; i++) {
            var r = rules[i];
            var wantedBy = this.wants[exp];
            var s = new State(r, 0, this.index, wantedBy);
            this.states.push(s);
        }
    }

    Column.prototype.complete = function(left, right) {
        var copy = left.nextState(right);
        this.states.push(copy);
    }


    function Grammar(rules, start) {
        this.rules = rules;
        this.start = start || this.rules[0].name;
        var byName = this.byName = {};
        this.rules.forEach(function(rule) {
            if (!byName.hasOwnProperty(rule.name)) {
                byName[rule.name] = [];
            }
            byName[rule.name].push(rule);
        });
    }

    // So we can allow passing (rules, start) directly to Parser for backwards compatibility
    Grammar.fromCompiled = function(rules, start) {
        var lexer = rules.Lexer;
        if (rules.ParserStart) {
          start = rules.ParserStart;
          rules = rules.ParserRules;
        }
        var rules = rules.map(function (r) { return (new Rule(r.name, r.symbols, r.postprocess)); });
        var g = new Grammar(rules, start);
        g.lexer = lexer; // nb. storing lexer on Grammar is iffy, but unavoidable
        return g;
    }


    function StreamLexer() {
      this.reset("");
    }

    StreamLexer.prototype.reset = function(data, state) {
        this.buffer = data;
        this.index = 0;
        this.line = state ? state.line : 1;
        this.lastLineBreak = state ? -state.col : 0;
    }

    StreamLexer.prototype.next = function() {
        if (this.index < this.buffer.length) {
            var ch = this.buffer[this.index++];
            if (ch === '\n') {
              this.line += 1;
              this.lastLineBreak = this.index;
            }
            return {value: ch};
        }
    }

    StreamLexer.prototype.save = function() {
      return {
        line: this.line,
        col: this.index - this.lastLineBreak,
      }
    }

    StreamLexer.prototype.formatError = function(token, message) {
        // nb. this gets called after consuming the offending token,
        // so the culprit is index-1
        var buffer = this.buffer;
        if (typeof buffer === 'string') {
            var lines = buffer
                .split("\n")
                .slice(
                    Math.max(0, this.line - 5), 
                    this.line
                );

            var nextLineBreak = buffer.indexOf('\n', this.index);
            if (nextLineBreak === -1) nextLineBreak = buffer.length;
            var col = this.index - this.lastLineBreak;
            var lastLineDigits = String(this.line).length;
            message += " at line " + this.line + " col " + col + ":\n\n";
            message += lines
                .map(function(line, i) {
                    return pad(this.line - lines.length + i + 1, lastLineDigits) + " " + line;
                }, this)
                .join("\n");
            message += "\n" + pad("", lastLineDigits + col) + "^\n";
            return message;
        } else {
            return message + " at index " + (this.index - 1);
        }

        function pad(n, length) {
            var s = String(n);
            return Array(length - s.length + 1).join(" ") + s;
        }
    }

    function Parser(rules, start, options) {
        if (rules instanceof Grammar) {
            var grammar = rules;
            var options = start;
        } else {
            var grammar = Grammar.fromCompiled(rules, start);
        }
        this.grammar = grammar;

        // Read options
        this.options = {
            keepHistory: false,
            lexer: grammar.lexer || new StreamLexer,
        };
        for (var key in (options || {})) {
            this.options[key] = options[key];
        }

        // Setup lexer
        this.lexer = this.options.lexer;
        this.lexerState = undefined;

        // Setup a table
        var column = new Column(grammar, 0);
        var table = this.table = [column];

        // I could be expecting anything.
        column.wants[grammar.start] = [];
        column.predict(grammar.start);
        // TODO what if start rule is nullable?
        column.process();
        this.current = 0; // token index
    }

    // create a reserved token for indicating a parse fail
    Parser.fail = {};

    Parser.prototype.feed = function(chunk) {
        var lexer = this.lexer;
        lexer.reset(chunk, this.lexerState);

        var token;
        while (true) {
            try {
                token = lexer.next();
                if (!token) {
                    break;
                }
            } catch (e) {
                // Create the next column so that the error reporter
                // can display the correctly predicted states.
                var nextColumn = new Column(this.grammar, this.current + 1);
                this.table.push(nextColumn);
                var err = new Error(this.reportLexerError(e));
                err.offset = this.current;
                err.token = e.token;
                throw err;
            }
            // We add new states to table[current+1]
            var column = this.table[this.current];

            // GC unused states
            if (!this.options.keepHistory) {
                delete this.table[this.current - 1];
            }

            var n = this.current + 1;
            var nextColumn = new Column(this.grammar, n);
            this.table.push(nextColumn);

            // Advance all tokens that expect the symbol
            var literal = token.text !== undefined ? token.text : token.value;
            var value = lexer.constructor === StreamLexer ? token.value : token;
            var scannable = column.scannable;
            for (var w = scannable.length; w--; ) {
                var state = scannable[w];
                var expect = state.rule.symbols[state.dot];
                // Try to consume the token
                // either regex or literal
                if (expect.test ? expect.test(value) :
                    expect.type ? expect.type === token.type
                                : expect.literal === literal) {
                    // Add it
                    var next = state.nextState({data: value, token: token, isToken: true, reference: n - 1});
                    nextColumn.states.push(next);
                }
            }

            // Next, for each of the rules, we either
            // (a) complete it, and try to see if the reference row expected that
            //     rule
            // (b) predict the next nonterminal it expects by adding that
            //     nonterminal's start state
            // To prevent duplication, we also keep track of rules we have already
            // added

            nextColumn.process();

            // If needed, throw an error:
            if (nextColumn.states.length === 0) {
                // No states at all! This is not good.
                var err = new Error(this.reportError(token));
                err.offset = this.current;
                err.token = token;
                throw err;
            }

            // maybe save lexer state
            if (this.options.keepHistory) {
              column.lexerState = lexer.save()
            }

            this.current++;
        }
        if (column) {
          this.lexerState = lexer.save()
        }

        // Incrementally keep track of results
        this.results = this.finish();

        // Allow chaining, for whatever it's worth
        return this;
    };

    Parser.prototype.reportLexerError = function(lexerError) {
        var tokenDisplay, lexerMessage;
        // Planning to add a token property to moo's thrown error
        // even on erroring tokens to be used in error display below
        var token = lexerError.token;
        if (token) {
            tokenDisplay = "input " + JSON.stringify(token.text[0]) + " (lexer error)";
            lexerMessage = this.lexer.formatError(token, "Syntax error");
        } else {
            tokenDisplay = "input (lexer error)";
            lexerMessage = lexerError.message;
        }
        return this.reportErrorCommon(lexerMessage, tokenDisplay);
    };

    Parser.prototype.reportError = function(token) {
        var tokenDisplay = (token.type ? token.type + " token: " : "") + JSON.stringify(token.value !== undefined ? token.value : token);
        var lexerMessage = this.lexer.formatError(token, "Syntax error");
        return this.reportErrorCommon(lexerMessage, tokenDisplay);
    };

    Parser.prototype.reportErrorCommon = function(lexerMessage, tokenDisplay) {
        var lines = [];
        lines.push(lexerMessage);
        var lastColumnIndex = this.table.length - 2;
        var lastColumn = this.table[lastColumnIndex];
        var expectantStates = lastColumn.states
            .filter(function(state) {
                var nextSymbol = state.rule.symbols[state.dot];
                return nextSymbol && typeof nextSymbol !== "string";
            });

        if (expectantStates.length === 0) {
            lines.push('Unexpected ' + tokenDisplay + '. I did not expect any more input. Here is the state of my parse table:\n');
            this.displayStateStack(lastColumn.states, lines);
        } else {
            lines.push('Unexpected ' + tokenDisplay + '. Instead, I was expecting to see one of the following:\n');
            // Display a "state stack" for each expectant state
            // - which shows you how this state came to be, step by step.
            // If there is more than one derivation, we only display the first one.
            var stateStacks = expectantStates
                .map(function(state) {
                    return this.buildFirstStateStack(state, []) || [state];
                }, this);
            // Display each state that is expecting a terminal symbol next.
            stateStacks.forEach(function(stateStack) {
                var state = stateStack[0];
                var nextSymbol = state.rule.symbols[state.dot];
                var symbolDisplay = this.getSymbolDisplay(nextSymbol);
                lines.push('A ' + symbolDisplay + ' based on:');
                this.displayStateStack(stateStack, lines);
            }, this);
        }
        lines.push("");
        return lines.join("\n");
    }
    
    Parser.prototype.displayStateStack = function(stateStack, lines) {
        var lastDisplay;
        var sameDisplayCount = 0;
        for (var j = 0; j < stateStack.length; j++) {
            var state = stateStack[j];
            var display = state.rule.toString(state.dot);
            if (display === lastDisplay) {
                sameDisplayCount++;
            } else {
                if (sameDisplayCount > 0) {
                    lines.push('    ^ ' + sameDisplayCount + ' more lines identical to this');
                }
                sameDisplayCount = 0;
                lines.push('    ' + display);
            }
            lastDisplay = display;
        }
    };

    Parser.prototype.getSymbolDisplay = function(symbol) {
        return getSymbolLongDisplay(symbol);
    };

    /*
    Builds a the first state stack. You can think of a state stack as the call stack
    of the recursive-descent parser which the Nearley parse algorithm simulates.
    A state stack is represented as an array of state objects. Within a
    state stack, the first item of the array will be the starting
    state, with each successive item in the array going further back into history.

    This function needs to be given a starting state and an empty array representing
    the visited states, and it returns an single state stack.

    */
    Parser.prototype.buildFirstStateStack = function(state, visited) {
        if (visited.indexOf(state) !== -1) {
            // Found cycle, return null
            // to eliminate this path from the results, because
            // we don't know how to display it meaningfully
            return null;
        }
        if (state.wantedBy.length === 0) {
            return [state];
        }
        var prevState = state.wantedBy[0];
        var childVisited = [state].concat(visited);
        var childResult = this.buildFirstStateStack(prevState, childVisited);
        if (childResult === null) {
            return null;
        }
        return [state].concat(childResult);
    };

    Parser.prototype.save = function() {
        var column = this.table[this.current];
        column.lexerState = this.lexerState;
        return column;
    };

    Parser.prototype.restore = function(column) {
        var index = column.index;
        this.current = index;
        this.table[index] = column;
        this.table.splice(index + 1);
        this.lexerState = column.lexerState;

        // Incrementally keep track of results
        this.results = this.finish();
    };

    // nb. deprecated: use save/restore instead!
    Parser.prototype.rewind = function(index) {
        if (!this.options.keepHistory) {
            throw new Error('set option `keepHistory` to enable rewinding')
        }
        // nb. recall column (table) indicies fall between token indicies.
        //        col 0   --   token 0   --   col 1
        this.restore(this.table[index]);
    };

    Parser.prototype.finish = function() {
        // Return the possible parsings
        var considerations = [];
        var start = this.grammar.start;
        var column = this.table[this.table.length - 1]
        column.states.forEach(function (t) {
            if (t.rule.name === start
                    && t.dot === t.rule.symbols.length
                    && t.reference === 0
                    && t.data !== Parser.fail) {
                considerations.push(t);
            }
        });
        return considerations.map(function(c) {return c.data; });
    };

    function getSymbolLongDisplay(symbol) {
        var type = typeof symbol;
        if (type === "string") {
            return symbol;
        } else if (type === "object") {
            if (symbol.literal) {
                return JSON.stringify(symbol.literal);
            } else if (symbol instanceof RegExp) {
                return 'character matching ' + symbol;
            } else if (symbol.type) {
                return symbol.type + ' token';
            } else if (symbol.test) {
                return 'token matching ' + String(symbol.test);
            } else {
                throw new Error('Unknown symbol type: ' + symbol);
            }
        }
    }

    function getSymbolShortDisplay(symbol) {
        var type = typeof symbol;
        if (type === "string") {
            return symbol;
        } else if (type === "object") {
            if (symbol.literal) {
                return JSON.stringify(symbol.literal);
            } else if (symbol instanceof RegExp) {
                return symbol.toString();
            } else if (symbol.type) {
                return '%' + symbol.type;
            } else if (symbol.test) {
                return '<' + String(symbol.test) + '>';
            } else {
                throw new Error('Unknown symbol type: ' + symbol);
            }
        }
    }

    return {
        Parser: Parser,
        Grammar: Grammar,
        Rule: Rule,
    };

}));


/***/ }),

/***/ "./src/grammar.js":
/*!************************!*\
  !*** ./src/grammar.js ***!
  \************************/
/***/ ((module) => {

// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }
var grammar = {
    Lexer: undefined,
    ParserRules: [
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", "wschar"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": function(d) {return null;}},
    {"name": "__$ebnf$1", "symbols": ["wschar"]},
    {"name": "__$ebnf$1", "symbols": ["__$ebnf$1", "wschar"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "__", "symbols": ["__$ebnf$1"], "postprocess": function(d) {return null;}},
    {"name": "wschar", "symbols": [/[ \t\n\v\f]/], "postprocess": id},
    {"name": "unsigned_int$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "unsigned_int$ebnf$1", "symbols": ["unsigned_int$ebnf$1", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "unsigned_int", "symbols": ["unsigned_int$ebnf$1"], "postprocess": 
        function(d) {
            return parseInt(d[0].join(""));
        }
        },
    {"name": "int$ebnf$1$subexpression$1", "symbols": [{"literal":"-"}]},
    {"name": "int$ebnf$1$subexpression$1", "symbols": [{"literal":"+"}]},
    {"name": "int$ebnf$1", "symbols": ["int$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "int$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "int$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "int$ebnf$2", "symbols": ["int$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "int", "symbols": ["int$ebnf$1", "int$ebnf$2"], "postprocess": 
        function(d) {
            if (d[0]) {
                return parseInt(d[0][0]+d[1].join(""));
            } else {
                return parseInt(d[1].join(""));
            }
        }
        },
    {"name": "unsigned_decimal$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "unsigned_decimal$ebnf$1", "symbols": ["unsigned_decimal$ebnf$1", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "unsigned_decimal$ebnf$2$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "unsigned_decimal$ebnf$2$subexpression$1$ebnf$1", "symbols": ["unsigned_decimal$ebnf$2$subexpression$1$ebnf$1", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "unsigned_decimal$ebnf$2$subexpression$1", "symbols": [{"literal":"."}, "unsigned_decimal$ebnf$2$subexpression$1$ebnf$1"]},
    {"name": "unsigned_decimal$ebnf$2", "symbols": ["unsigned_decimal$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "unsigned_decimal$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "unsigned_decimal", "symbols": ["unsigned_decimal$ebnf$1", "unsigned_decimal$ebnf$2"], "postprocess": 
        function(d) {
            return parseFloat(
                d[0].join("") +
                (d[1] ? "."+d[1][1].join("") : "")
            );
        }
        },
    {"name": "decimal$ebnf$1", "symbols": [{"literal":"-"}], "postprocess": id},
    {"name": "decimal$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "decimal$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "decimal$ebnf$2", "symbols": ["decimal$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "decimal$ebnf$3$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "decimal$ebnf$3$subexpression$1$ebnf$1", "symbols": ["decimal$ebnf$3$subexpression$1$ebnf$1", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "decimal$ebnf$3$subexpression$1", "symbols": [{"literal":"."}, "decimal$ebnf$3$subexpression$1$ebnf$1"]},
    {"name": "decimal$ebnf$3", "symbols": ["decimal$ebnf$3$subexpression$1"], "postprocess": id},
    {"name": "decimal$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "decimal", "symbols": ["decimal$ebnf$1", "decimal$ebnf$2", "decimal$ebnf$3"], "postprocess": 
        function(d) {
            return parseFloat(
                (d[0] || "") +
                d[1].join("") +
                (d[2] ? "."+d[2][1].join("") : "")
            );
        }
        },
    {"name": "percentage", "symbols": ["decimal", {"literal":"%"}], "postprocess": 
        function(d) {
            return d[0]/100;
        }
        },
    {"name": "jsonfloat$ebnf$1", "symbols": [{"literal":"-"}], "postprocess": id},
    {"name": "jsonfloat$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "jsonfloat$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "jsonfloat$ebnf$2", "symbols": ["jsonfloat$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "jsonfloat$ebnf$3$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "jsonfloat$ebnf$3$subexpression$1$ebnf$1", "symbols": ["jsonfloat$ebnf$3$subexpression$1$ebnf$1", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "jsonfloat$ebnf$3$subexpression$1", "symbols": [{"literal":"."}, "jsonfloat$ebnf$3$subexpression$1$ebnf$1"]},
    {"name": "jsonfloat$ebnf$3", "symbols": ["jsonfloat$ebnf$3$subexpression$1"], "postprocess": id},
    {"name": "jsonfloat$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$1", "symbols": [/[+-]/], "postprocess": id},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$2", "symbols": ["jsonfloat$ebnf$4$subexpression$1$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "jsonfloat$ebnf$4$subexpression$1", "symbols": [/[eE]/, "jsonfloat$ebnf$4$subexpression$1$ebnf$1", "jsonfloat$ebnf$4$subexpression$1$ebnf$2"]},
    {"name": "jsonfloat$ebnf$4", "symbols": ["jsonfloat$ebnf$4$subexpression$1"], "postprocess": id},
    {"name": "jsonfloat$ebnf$4", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "jsonfloat", "symbols": ["jsonfloat$ebnf$1", "jsonfloat$ebnf$2", "jsonfloat$ebnf$3", "jsonfloat$ebnf$4"], "postprocess": 
        function(d) {
            return parseFloat(
                (d[0] || "") +
                d[1].join("") +
                (d[2] ? "."+d[2][1].join("") : "") +
                (d[3] ? "e" + (d[3][1] || "+") + d[3][2].join("") : "")
            );
        }
        },
    {"name": "equation", "symbols": ["_", "expression", "_"], "postprocess": (data) => data[1]},
    {"name": "expression", "symbols": ["expression_A"], "postprocess": id},
    {"name": "expression_A$subexpression$1", "symbols": [{"literal":"+"}]},
    {"name": "expression_A$subexpression$1", "symbols": [{"literal":"-"}]},
    {"name": "expression_A", "symbols": ["expression_A", "_", "expression_A$subexpression$1", "_", "expression_B"], "postprocess":  (data) => ({
            type: 'operation',
            op: data[2][0],
            lhs: data[0],
            rhs: data[4]
        }) },
    {"name": "expression_A", "symbols": ["expression_B"], "postprocess": id},
    {"name": "expression_B$subexpression$1", "symbols": [{"literal":"*"}]},
    {"name": "expression_B$subexpression$1", "symbols": [{"literal":"/"}]},
    {"name": "expression_B", "symbols": ["expression_B", "_", "expression_B$subexpression$1", "_", "expression_C"], "postprocess":  (data) => ({
            type: 'operation',
            op: data[2][0],
            lhs: data[0],
            rhs: data[4]
        }) },
    {"name": "expression_B", "symbols": ["expression_C"], "postprocess": id},
    {"name": "expression_C", "symbols": ["expression_C", "_", {"literal":"^"}, "_", "expression_D"], "postprocess":  (data) => ({
            type: 'operation',
            op: data[2],
            lhs: data[0],
            rhs: data[4]
        }) },
    {"name": "expression_C", "symbols": ["expression_D"], "postprocess": id},
    {"name": "expression_D$ebnf$1", "symbols": []},
    {"name": "expression_D$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_", "expression", "_"]},
    {"name": "expression_D$ebnf$1", "symbols": ["expression_D$ebnf$1", "expression_D$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "expression_D", "symbols": ["function", {"literal":"("}, "_", "expression", "_", "expression_D$ebnf$1", "_", {"literal":")"}], "postprocess":  (data) => ({
            type: 'function',
            function: data[0],
            args: [data[3], ...data[5].map(data => data[2])]
        }) },
    {"name": "expression_D", "symbols": [{"literal":"("}, "_", "expression", "_", {"literal":")"}], "postprocess": (data) => (data[2])},
    {"name": "expression_D", "symbols": ["token"], "postprocess": id},
    {"name": "token", "symbols": ["int"], "postprocess":  (data) => ({
            type: 'number',
            re: data[0],
            im: 0
        }) },
    {"name": "token", "symbols": ["decimal"], "postprocess":  (data) => ({
            type: 'number',
            re: data[0],
            im: 0
        }) },
    {"name": "token", "symbols": ["int", {"literal":"i"}], "postprocess":  (data) => ({
            type: 'number',
            re: 0,
            im: data[0]
        }) },
    {"name": "token", "symbols": ["decimal", {"literal":"i"}], "postprocess":  (data) => ({
            type: 'number',
            re: 0,
            im: data[0]
        }) },
    {"name": "token", "symbols": [{"literal":"i"}], "postprocess":  (data) => ({
            type: 'number',
            re: 0,
            im: 1
        }) },
    {"name": "token", "symbols": [{"literal":"z"}], "postprocess": id},
    {"name": "token$string$1", "symbols": [{"literal":"z"}, {"literal":"'"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "token", "symbols": ["token$string$1"], "postprocess": id},
    {"name": "token", "symbols": [{"literal":"t"}], "postprocess": id},
    {"name": "token", "symbols": [{"literal":"e"}], "postprocess": id},
    {"name": "token$string$2", "symbols": [{"literal":"p"}, {"literal":"i"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "token", "symbols": ["token$string$2"], "postprocess": id},
    {"name": "function$string$1", "symbols": [{"literal":"s"}, {"literal":"q"}, {"literal":"r"}, {"literal":"t"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$1"], "postprocess": id},
    {"name": "function$string$2", "symbols": [{"literal":"l"}, {"literal":"o"}, {"literal":"g"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$2"], "postprocess": id},
    {"name": "function$string$3", "symbols": [{"literal":"s"}, {"literal":"i"}, {"literal":"n"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$3"], "postprocess": id},
    {"name": "function$string$4", "symbols": [{"literal":"c"}, {"literal":"o"}, {"literal":"s"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$4"], "postprocess": id},
    {"name": "function$string$5", "symbols": [{"literal":"t"}, {"literal":"a"}, {"literal":"n"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$5"], "postprocess": id},
    {"name": "function$string$6", "symbols": [{"literal":"s"}, {"literal":"i"}, {"literal":"n"}, {"literal":"h"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$6"], "postprocess": id},
    {"name": "function$string$7", "symbols": [{"literal":"c"}, {"literal":"o"}, {"literal":"s"}, {"literal":"h"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$7"], "postprocess": id},
    {"name": "function$string$8", "symbols": [{"literal":"t"}, {"literal":"a"}, {"literal":"n"}, {"literal":"h"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$8"], "postprocess": id},
    {"name": "function$string$9", "symbols": [{"literal":"a"}, {"literal":"s"}, {"literal":"i"}, {"literal":"n"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$9"], "postprocess": id},
    {"name": "function$string$10", "symbols": [{"literal":"a"}, {"literal":"c"}, {"literal":"o"}, {"literal":"s"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$10"], "postprocess": id},
    {"name": "function$string$11", "symbols": [{"literal":"a"}, {"literal":"t"}, {"literal":"a"}, {"literal":"n"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$11"], "postprocess": id},
    {"name": "function$string$12", "symbols": [{"literal":"i"}, {"literal":"t"}, {"literal":"e"}, {"literal":"r"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$12"], "postprocess": id},
    {"name": "function$string$13", "symbols": [{"literal":"g"}, {"literal":"a"}, {"literal":"m"}, {"literal":"m"}, {"literal":"a"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "function", "symbols": ["function$string$13"], "postprocess": id},
    {"name": "operator", "symbols": [{"literal":"^"}], "postprocess": id},
    {"name": "operator", "symbols": [{"literal":"*"}], "postprocess": id},
    {"name": "operator", "symbols": [{"literal":"/"}], "postprocess": id},
    {"name": "operator", "symbols": [{"literal":"+"}], "postprocess": id},
    {"name": "operator", "symbols": [{"literal":"-"}], "postprocess": id}
]
  , ParserStart: "equation"
}
if ( true&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var nearley__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! nearley */ "./node_modules/nearley/lib/nearley.js");
/* harmony import */ var nearley__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(nearley__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _grammar__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./grammar */ "./src/grammar.js");
/* harmony import */ var _grammar__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_grammar__WEBPACK_IMPORTED_MODULE_1__);
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};


const screenDims = document.body.getBoundingClientRect();
const screen_w = screenDims.width;
const screen_h = screenDims.height;
const screenDimension = [screen_w, screen_h];
const mainCanvas = document.getElementById('main-canvas');
mainCanvas.width = screenDimension[0];
mainCanvas.height = screenDimension[1];
// handle window resizing
window.addEventListener('resize', () => {
    const screenDims = document.body.getBoundingClientRect();
    const screen_w = screenDims.width;
    const screen_h = screenDims.height;
    screenDimension[0] = screen_w;
    screenDimension[1] = screen_h;
    mainCanvas.width = screenDimension[0];
    mainCanvas.height = screenDimension[1];
});
// handle scroll wheel
let linear_zoom = 0.5;
let log_zoom = Math.exp(linear_zoom);
mainCanvas.addEventListener('wheel', (ev) => {
    const direction = ev.deltaY / 1000;
    linear_zoom += direction;
    let prev_log_zoom = log_zoom;
    log_zoom = Math.exp(linear_zoom);
    position[0] += (ev.offsetX - (screenDimension[0] / 2)) * (log_zoom - prev_log_zoom);
    position[1] += (ev.offsetY - (screenDimension[1] / 2)) * (log_zoom - prev_log_zoom);
});
// handle mouse drag events
let mouseDown = false;
let position = [0, 0];
mainCanvas.addEventListener('mousedown', (ev) => {
    mouseDown = true;
});
mainCanvas.addEventListener('mousemove', (ev) => {
    if (!mouseDown)
        return;
    position[0] += ev.movementX * log_zoom;
    position[1] += ev.movementY * log_zoom;
});
mainCanvas.addEventListener('mouseup', (ev) => {
    mouseDown = false;
});
mainCanvas.addEventListener('mouseleave', (ev) => {
    mouseDown = false;
});
const resetViewBtn = document.getElementById('view-btn');
if (resetViewBtn)
    resetViewBtn.addEventListener('click', () => {
        position = [0, 0];
        linear_zoom = 0.5;
        log_zoom = Math.exp(linear_zoom);
    });
const resetTimeBtn = document.getElementById('time-btn');
if (resetTimeBtn)
    resetTimeBtn.addEventListener('click', () => {
        frameCount = 0;
    });
const initialize = () => __awaiter(void 0, void 0, void 0, function* () {
    const adapter = yield navigator.gpu.requestAdapter();
    if (!adapter)
        return;
    const device = yield adapter.requestDevice();
    const context = mainCanvas.getContext("webgpu");
    if (!context)
        return;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });
    return {
        adapter: adapter,
        device: device,
        context: context,
        format: format
    };
});
let current = 0;
let frameCount = 0;
const compile = (command, config, id) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(command);
    // initialize gpu
    const { adapter: adapter, device: device, context: context, format: format } = config;
    // init buffers to pass values in via uniform buffers, 4x f32s
    const ioBufferSize = 4 * 4;
    const ioBuffer = device.createBuffer({
        size: ioBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const ioBuffer2 = device.createBuffer({
        size: ioBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    let res = yield fetch('./program.wgsl');
    let text = yield res.text();
    console.log(command);
    let code = text.replace('[[EXPR]]', command);
    if (iterFlag) {
        code += `\n${iterCode}`;
    }
    // create gpu rendering pipeline
    const shaderModule = device.createShaderModule({ code });
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "vertexMain"
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragmentMain",
            targets: [{ format }],
        },
    });
    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: ioBuffer
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: ioBuffer2
                }
            }
        ]
    });
    // fps calculation variables
    const fpsLabel = document.getElementById('fps');
    let prevTime = new Date();
    let secondCounter = new Date();
    let avgFps;
    frameCount = 0;
    let alpha = 0.95;
    const frame = () => {
        // update values to pass in via uniform buffers
        device.queue.writeBuffer(ioBuffer, 0, new Float32Array([log_zoom, position[0], position[1], frameCount]));
        device.queue.writeBuffer(ioBuffer2, 0, new Float32Array([screenDimension[0], screenDimension[1], 0, 0]));
        // create full draw command for gpu
        const commandEncoder = device.createCommandEncoder();
        const colorAttachments = [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            },
        ];
        const passEncoder = commandEncoder.beginRenderPass({ colorAttachments });
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6);
        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);
        // calculate and update fps
        const newTime = new Date();
        const dt = newTime.getTime() - prevTime.getTime();
        let cur_fps = 1000 / dt;
        if (!avgFps)
            avgFps = cur_fps;
        if (avgFps === Infinity)
            avgFps = 60;
        if (cur_fps === Infinity)
            cur_fps = 60;
        avgFps = alpha * avgFps + (1 - alpha) * cur_fps;
        if (newTime.getTime() - secondCounter.getTime() > 500) {
            if (fpsLabel)
                fpsLabel.innerText = `FPS: ${Math.round(avgFps)}`;
            secondCounter = newTime;
        }
        prevTime = newTime;
        frameCount++;
        if (id === current)
            requestAnimationFrame(frame);
    };
    frame();
});
let gpuConfig;
initialize().then((config) => {
    if (!config)
        return;
    gpuConfig = config;
    compile(defaultCommand, config, 0);
});
// set up input command parsing
const defaultCommand = 'c_div(vec2f(1.0, 0.0), z)';
let iterFlag = false;
let iterCode = ``;
const parseInput = (s) => {
    const parser = new nearley__WEBPACK_IMPORTED_MODULE_0__.Parser(nearley__WEBPACK_IMPORTED_MODULE_0__.Grammar.fromCompiled(_grammar__WEBPACK_IMPORTED_MODULE_1__));
    try {
        parser.feed(s);
    }
    catch (e) {
        return '';
    }
    if (parser.results.length === 0)
        return '';
    let result = parser.results[0];
    let error = false;
    iterFlag = false;
    iterCode = '';
    const expand = (result) => {
        if (typeof result === 'string') {
            if (result === 'e')
                return 'vec2f(2.7182818284590, 0.0)';
            else if (result === 'pi')
                return 'vec2f(3.1415926535897, 0.0)';
            return result;
        }
        else if (typeof result === 'number') {
            return `vec2f(${result}, 0.0)`;
        }
        else if (typeof result === 'object') {
            if (!result.type) {
                error = true;
                return '';
            }
            if (result.type === 'number') {
                return `vec2f(${result.re}, ${result.im})`;
            }
            else if (result.type === 'operation') {
                let op = result.op;
                let lhs = expand(result.lhs);
                let rhs = expand(result.rhs);
                if (op === '+') {
                    return `c_add(${lhs},${rhs})`;
                }
                else if (op === '-') {
                    return `c_sub(${lhs},${rhs})`;
                }
                else if (op === '*') {
                    return `c_mul(${lhs},${rhs})`;
                }
                else if (op === '/') {
                    return `c_div(${lhs},${rhs})`;
                }
                else if (op === '^') {
                    return `c_pow(${lhs},${rhs})`;
                }
                else {
                    error = true;
                    return '';
                }
            }
            else if (result.type === 'function') {
                let func = result.function;
                let args = result.args.map((arg) => expand(arg));
                if (func === 'iter') {
                    if (args.length !== 2)
                        return '';
                    iterCode = `
                    fn c_iter(z: vec2f) -> vec2f {
                        let time: f32 = uniforms[3] / 1000.0; // in seconds
                        let dt: f32 = time;
                        let t = vec2f(dt, 0.0);

                        var zp = z;
                        for(var i = 0.0; i < f32(${args[1]}[0]); i += 1.0){ // numbers are converted to complex
                            zp = ${args[0].replace(/z'/g, 'zp')};
                        }
                        return zp;
                    }
                    `;
                    iterFlag = true;
                    return `c_iter(z)`;
                }
                else {
                    return `c_${func}(${args.join(',')})`;
                }
            }
            else {
                error = true;
                return '';
            }
        }
        else {
            error = true;
            return '';
        }
    };
    let expandedResult = expand(result);
    if (expandedResult === '') {
        return '';
    }
    else if (error) {
        return '';
    }
    else {
        return expandedResult;
    }
};
/*
Favs:
iter((z*(t+1))^i+z'^i/(t+1),10)
*/
let fantasyCounter = 0;
let inputs = [
    "1/iter(z+z'^(i+sin(t)),10)+1",
    "iter(z^(i*0.5)+sqrt(z'*(t+1)*i*(-1)),8)",
    "atan(i+z*(t+0.2))",
    "z+sin(z*i*t)+cos(z*i*t*2)",
    "iter(z*sqrt((t+0.5)*i)+z'^(sqrt(1/t+i)),10)",
    "iter(z*sin(t*i)+z'^i,10)",
    "z+sin(z*i*t)^(i*t*2)",
    "sin(i*z-z^(2*t))+tan(1/z-z^2)",
    "sqrt(z-z^(2*t))+1/z-z^2",
    "1/iter(z+z'^(t),8)+1",
    "t/iter(z+z'^(i+tan(t)),4)+1"
];
const pushMeButton = document.getElementById('push-me-button');
pushMeButton.addEventListener('click', () => {
    next();
});
const next = () => {
    fantasyCounter += 1;
    fantasyCounter %= inputs.length;
    const result = parseInput(inputs[fantasyCounter]);
    current += 1;
    if (result !== '')
        compile(result, gpuConfig, current);
    console.log("RESET");
};
setInterval(() => {
    next();
}, 10000);
setTimeout(() => {
    next();
}, 1000);

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxVQUFVO0FBQ1Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7O0FBRWI7QUFDQTtBQUNBO0FBQ0EsVUFBVTtBQUNWO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsdUJBQXVCO0FBQy9DO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsY0FBYztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1QsK0NB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Q0FBQyxnQkFBZ0IsQ0FBc0IsQ0FBQztBQUNwRixZQUFZLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtJQUN4QyxJQUFJLEVBQUUsQ0FBQztBQUNYLENBQUMsQ0FBQyxDQUFDO0FBRUgsTUFBTSxJQUFJLEdBQUcsR0FBRyxFQUFFO0lBQ2QsY0FBYyxJQUFJLENBQUMsQ0FBQztJQUNwQixjQUFjLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUVoQyxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFDbEQsT0FBTyxJQUFJLENBQUMsQ0FBQztJQUNiLElBQUcsTUFBTSxLQUFLLEVBQUU7UUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN0RCxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQztBQUN4QixDQUFDO0FBQ0QsV0FBVyxDQUFDLEdBQUcsRUFBRTtJQUNiLElBQUksRUFBRSxDQUFDO0FBQ1gsQ0FBQyxFQUFFLEtBQUssQ0FBQztBQUNULFVBQVUsQ0FBQyxHQUFHLEVBQUU7SUFDWixJQUFJLEVBQUUsQ0FBQztBQUNYLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyIsInNvdXJjZXMiOlsid2VicGFjazovL2NvbmZvcm1hbC1tYXAtd2ViZ3B1Ly4vbm9kZV9tb2R1bGVzL25lYXJsZXkvbGliL25lYXJsZXkuanMiLCJ3ZWJwYWNrOi8vY29uZm9ybWFsLW1hcC13ZWJncHUvLi9zcmMvZ3JhbW1hci5qcyIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL3J1bnRpbWUvY29tcGF0IGdldCBkZWZhdWx0IGV4cG9ydCIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL3J1bnRpbWUvZGVmaW5lIHByb3BlcnR5IGdldHRlcnMiLCJ3ZWJwYWNrOi8vY29uZm9ybWFsLW1hcC13ZWJncHUvd2VicGFjay9ydW50aW1lL2hhc093blByb3BlcnR5IHNob3J0aGFuZCIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL3J1bnRpbWUvbWFrZSBuYW1lc3BhY2Ugb2JqZWN0Iiwid2VicGFjazovL2NvbmZvcm1hbC1tYXAtd2ViZ3B1Ly4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbihyb290LCBmYWN0b3J5KSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJvb3QubmVhcmxleSA9IGZhY3RvcnkoKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uKCkge1xuXG4gICAgZnVuY3Rpb24gUnVsZShuYW1lLCBzeW1ib2xzLCBwb3N0cHJvY2Vzcykge1xuICAgICAgICB0aGlzLmlkID0gKytSdWxlLmhpZ2hlc3RJZDtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAgICAgdGhpcy5zeW1ib2xzID0gc3ltYm9sczsgICAgICAgIC8vIGEgbGlzdCBvZiBsaXRlcmFsIHwgcmVnZXggY2xhc3MgfCBub250ZXJtaW5hbFxuICAgICAgICB0aGlzLnBvc3Rwcm9jZXNzID0gcG9zdHByb2Nlc3M7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBSdWxlLmhpZ2hlc3RJZCA9IDA7XG5cbiAgICBSdWxlLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKHdpdGhDdXJzb3JBdCkge1xuICAgICAgICB2YXIgc3ltYm9sU2VxdWVuY2UgPSAodHlwZW9mIHdpdGhDdXJzb3JBdCA9PT0gXCJ1bmRlZmluZWRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyB0aGlzLnN5bWJvbHMubWFwKGdldFN5bWJvbFNob3J0RGlzcGxheSkuam9pbignICcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogKCAgIHRoaXMuc3ltYm9scy5zbGljZSgwLCB3aXRoQ3Vyc29yQXQpLm1hcChnZXRTeW1ib2xTaG9ydERpc3BsYXkpLmpvaW4oJyAnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBcIiDil48gXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgdGhpcy5zeW1ib2xzLnNsaWNlKHdpdGhDdXJzb3JBdCkubWFwKGdldFN5bWJvbFNob3J0RGlzcGxheSkuam9pbignICcpICAgICApO1xuICAgICAgICByZXR1cm4gdGhpcy5uYW1lICsgXCIg4oaSIFwiICsgc3ltYm9sU2VxdWVuY2U7XG4gICAgfVxuXG5cbiAgICAvLyBhIFN0YXRlIGlzIGEgcnVsZSBhdCBhIHBvc2l0aW9uIGZyb20gYSBnaXZlbiBzdGFydGluZyBwb2ludCBpbiB0aGUgaW5wdXQgc3RyZWFtIChyZWZlcmVuY2UpXG4gICAgZnVuY3Rpb24gU3RhdGUocnVsZSwgZG90LCByZWZlcmVuY2UsIHdhbnRlZEJ5KSB7XG4gICAgICAgIHRoaXMucnVsZSA9IHJ1bGU7XG4gICAgICAgIHRoaXMuZG90ID0gZG90O1xuICAgICAgICB0aGlzLnJlZmVyZW5jZSA9IHJlZmVyZW5jZTtcbiAgICAgICAgdGhpcy5kYXRhID0gW107XG4gICAgICAgIHRoaXMud2FudGVkQnkgPSB3YW50ZWRCeTtcbiAgICAgICAgdGhpcy5pc0NvbXBsZXRlID0gdGhpcy5kb3QgPT09IHJ1bGUuc3ltYm9scy5sZW5ndGg7XG4gICAgfVxuXG4gICAgU3RhdGUucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBcIntcIiArIHRoaXMucnVsZS50b1N0cmluZyh0aGlzLmRvdCkgKyBcIn0sIGZyb206IFwiICsgKHRoaXMucmVmZXJlbmNlIHx8IDApO1xuICAgIH07XG5cbiAgICBTdGF0ZS5wcm90b3R5cGUubmV4dFN0YXRlID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgdmFyIHN0YXRlID0gbmV3IFN0YXRlKHRoaXMucnVsZSwgdGhpcy5kb3QgKyAxLCB0aGlzLnJlZmVyZW5jZSwgdGhpcy53YW50ZWRCeSk7XG4gICAgICAgIHN0YXRlLmxlZnQgPSB0aGlzO1xuICAgICAgICBzdGF0ZS5yaWdodCA9IGNoaWxkO1xuICAgICAgICBpZiAoc3RhdGUuaXNDb21wbGV0ZSkge1xuICAgICAgICAgICAgc3RhdGUuZGF0YSA9IHN0YXRlLmJ1aWxkKCk7XG4gICAgICAgICAgICAvLyBIYXZpbmcgcmlnaHQgc2V0IGhlcmUgd2lsbCBwcmV2ZW50IHRoZSByaWdodCBzdGF0ZSBhbmQgaXRzIGNoaWxkcmVuXG4gICAgICAgICAgICAvLyBmb3JtIGJlaW5nIGdhcmJhZ2UgY29sbGVjdGVkXG4gICAgICAgICAgICBzdGF0ZS5yaWdodCA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgfTtcblxuICAgIFN0YXRlLnByb3RvdHlwZS5idWlsZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY2hpbGRyZW4gPSBbXTtcbiAgICAgICAgdmFyIG5vZGUgPSB0aGlzO1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKG5vZGUucmlnaHQuZGF0YSk7XG4gICAgICAgICAgICBub2RlID0gbm9kZS5sZWZ0O1xuICAgICAgICB9IHdoaWxlIChub2RlLmxlZnQpO1xuICAgICAgICBjaGlsZHJlbi5yZXZlcnNlKCk7XG4gICAgICAgIHJldHVybiBjaGlsZHJlbjtcbiAgICB9O1xuXG4gICAgU3RhdGUucHJvdG90eXBlLmZpbmlzaCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5ydWxlLnBvc3Rwcm9jZXNzKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSB0aGlzLnJ1bGUucG9zdHByb2Nlc3ModGhpcy5kYXRhLCB0aGlzLnJlZmVyZW5jZSwgUGFyc2VyLmZhaWwpO1xuICAgICAgICB9XG4gICAgfTtcblxuXG4gICAgZnVuY3Rpb24gQ29sdW1uKGdyYW1tYXIsIGluZGV4KSB7XG4gICAgICAgIHRoaXMuZ3JhbW1hciA9IGdyYW1tYXI7XG4gICAgICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICAgICAgdGhpcy5zdGF0ZXMgPSBbXTtcbiAgICAgICAgdGhpcy53YW50cyA9IHt9OyAvLyBzdGF0ZXMgaW5kZXhlZCBieSB0aGUgbm9uLXRlcm1pbmFsIHRoZXkgZXhwZWN0XG4gICAgICAgIHRoaXMuc2Nhbm5hYmxlID0gW107IC8vIGxpc3Qgb2Ygc3RhdGVzIHRoYXQgZXhwZWN0IGEgdG9rZW5cbiAgICAgICAgdGhpcy5jb21wbGV0ZWQgPSB7fTsgLy8gc3RhdGVzIHRoYXQgYXJlIG51bGxhYmxlXG4gICAgfVxuXG5cbiAgICBDb2x1bW4ucHJvdG90eXBlLnByb2Nlc3MgPSBmdW5jdGlvbihuZXh0Q29sdW1uKSB7XG4gICAgICAgIHZhciBzdGF0ZXMgPSB0aGlzLnN0YXRlcztcbiAgICAgICAgdmFyIHdhbnRzID0gdGhpcy53YW50cztcbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IHRoaXMuY29tcGxldGVkO1xuXG4gICAgICAgIGZvciAodmFyIHcgPSAwOyB3IDwgc3RhdGVzLmxlbmd0aDsgdysrKSB7IC8vIG5iLiB3ZSBwdXNoKCkgZHVyaW5nIGl0ZXJhdGlvblxuICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RhdGVzW3ddO1xuXG4gICAgICAgICAgICBpZiAoc3RhdGUuaXNDb21wbGV0ZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLmZpbmlzaCgpO1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5kYXRhICE9PSBQYXJzZXIuZmFpbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBjb21wbGV0ZVxuICAgICAgICAgICAgICAgICAgICB2YXIgd2FudGVkQnkgPSBzdGF0ZS53YW50ZWRCeTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IHdhbnRlZEJ5Lmxlbmd0aDsgaS0tOyApIHsgLy8gdGhpcyBsaW5lIGlzIGhvdFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxlZnQgPSB3YW50ZWRCeVtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29tcGxldGUobGVmdCwgc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc3BlY2lhbC1jYXNlIG51bGxhYmxlc1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUucmVmZXJlbmNlID09PSB0aGlzLmluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIHN1cmUgZnV0dXJlIHByZWRpY3RvcnMgb2YgdGhpcyBydWxlIGdldCBjb21wbGV0ZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZXhwID0gc3RhdGUucnVsZS5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMuY29tcGxldGVkW2V4cF0gPSB0aGlzLmNvbXBsZXRlZFtleHBdIHx8IFtdKS5wdXNoKHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBxdWV1ZSBzY2FubmFibGUgc3RhdGVzXG4gICAgICAgICAgICAgICAgdmFyIGV4cCA9IHN0YXRlLnJ1bGUuc3ltYm9sc1tzdGF0ZS5kb3RdO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZXhwICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjYW5uYWJsZS5wdXNoKHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gcHJlZGljdFxuICAgICAgICAgICAgICAgIGlmICh3YW50c1tleHBdKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhbnRzW2V4cF0ucHVzaChzdGF0ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZC5oYXNPd25Qcm9wZXJ0eShleHApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbnVsbHMgPSBjb21wbGV0ZWRbZXhwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVsbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmlnaHQgPSBudWxsc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbXBsZXRlKHN0YXRlLCByaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB3YW50c1tleHBdID0gW3N0YXRlXTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmVkaWN0KGV4cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgQ29sdW1uLnByb3RvdHlwZS5wcmVkaWN0ID0gZnVuY3Rpb24oZXhwKSB7XG4gICAgICAgIHZhciBydWxlcyA9IHRoaXMuZ3JhbW1hci5ieU5hbWVbZXhwXSB8fCBbXTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJ1bGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgciA9IHJ1bGVzW2ldO1xuICAgICAgICAgICAgdmFyIHdhbnRlZEJ5ID0gdGhpcy53YW50c1tleHBdO1xuICAgICAgICAgICAgdmFyIHMgPSBuZXcgU3RhdGUociwgMCwgdGhpcy5pbmRleCwgd2FudGVkQnkpO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZXMucHVzaChzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIENvbHVtbi5wcm90b3R5cGUuY29tcGxldGUgPSBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICB2YXIgY29weSA9IGxlZnQubmV4dFN0YXRlKHJpZ2h0KTtcbiAgICAgICAgdGhpcy5zdGF0ZXMucHVzaChjb3B5KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIEdyYW1tYXIocnVsZXMsIHN0YXJ0KSB7XG4gICAgICAgIHRoaXMucnVsZXMgPSBydWxlcztcbiAgICAgICAgdGhpcy5zdGFydCA9IHN0YXJ0IHx8IHRoaXMucnVsZXNbMF0ubmFtZTtcbiAgICAgICAgdmFyIGJ5TmFtZSA9IHRoaXMuYnlOYW1lID0ge307XG4gICAgICAgIHRoaXMucnVsZXMuZm9yRWFjaChmdW5jdGlvbihydWxlKSB7XG4gICAgICAgICAgICBpZiAoIWJ5TmFtZS5oYXNPd25Qcm9wZXJ0eShydWxlLm5hbWUpKSB7XG4gICAgICAgICAgICAgICAgYnlOYW1lW3J1bGUubmFtZV0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJ5TmFtZVtydWxlLm5hbWVdLnB1c2gocnVsZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvIHdlIGNhbiBhbGxvdyBwYXNzaW5nIChydWxlcywgc3RhcnQpIGRpcmVjdGx5IHRvIFBhcnNlciBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgICBHcmFtbWFyLmZyb21Db21waWxlZCA9IGZ1bmN0aW9uKHJ1bGVzLCBzdGFydCkge1xuICAgICAgICB2YXIgbGV4ZXIgPSBydWxlcy5MZXhlcjtcbiAgICAgICAgaWYgKHJ1bGVzLlBhcnNlclN0YXJ0KSB7XG4gICAgICAgICAgc3RhcnQgPSBydWxlcy5QYXJzZXJTdGFydDtcbiAgICAgICAgICBydWxlcyA9IHJ1bGVzLlBhcnNlclJ1bGVzO1xuICAgICAgICB9XG4gICAgICAgIHZhciBydWxlcyA9IHJ1bGVzLm1hcChmdW5jdGlvbiAocikgeyByZXR1cm4gKG5ldyBSdWxlKHIubmFtZSwgci5zeW1ib2xzLCByLnBvc3Rwcm9jZXNzKSk7IH0pO1xuICAgICAgICB2YXIgZyA9IG5ldyBHcmFtbWFyKHJ1bGVzLCBzdGFydCk7XG4gICAgICAgIGcubGV4ZXIgPSBsZXhlcjsgLy8gbmIuIHN0b3JpbmcgbGV4ZXIgb24gR3JhbW1hciBpcyBpZmZ5LCBidXQgdW5hdm9pZGFibGVcbiAgICAgICAgcmV0dXJuIGc7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBTdHJlYW1MZXhlcigpIHtcbiAgICAgIHRoaXMucmVzZXQoXCJcIik7XG4gICAgfVxuXG4gICAgU3RyZWFtTGV4ZXIucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24oZGF0YSwgc3RhdGUpIHtcbiAgICAgICAgdGhpcy5idWZmZXIgPSBkYXRhO1xuICAgICAgICB0aGlzLmluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5saW5lID0gc3RhdGUgPyBzdGF0ZS5saW5lIDogMTtcbiAgICAgICAgdGhpcy5sYXN0TGluZUJyZWFrID0gc3RhdGUgPyAtc3RhdGUuY29sIDogMDtcbiAgICB9XG5cbiAgICBTdHJlYW1MZXhlci5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5pbmRleCA8IHRoaXMuYnVmZmVyLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGNoID0gdGhpcy5idWZmZXJbdGhpcy5pbmRleCsrXTtcbiAgICAgICAgICAgIGlmIChjaCA9PT0gJ1xcbicpIHtcbiAgICAgICAgICAgICAgdGhpcy5saW5lICs9IDE7XG4gICAgICAgICAgICAgIHRoaXMubGFzdExpbmVCcmVhayA9IHRoaXMuaW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge3ZhbHVlOiBjaH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBTdHJlYW1MZXhlci5wcm90b3R5cGUuc2F2ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICBjb2w6IHRoaXMuaW5kZXggLSB0aGlzLmxhc3RMaW5lQnJlYWssXG4gICAgICB9XG4gICAgfVxuXG4gICAgU3RyZWFtTGV4ZXIucHJvdG90eXBlLmZvcm1hdEVycm9yID0gZnVuY3Rpb24odG9rZW4sIG1lc3NhZ2UpIHtcbiAgICAgICAgLy8gbmIuIHRoaXMgZ2V0cyBjYWxsZWQgYWZ0ZXIgY29uc3VtaW5nIHRoZSBvZmZlbmRpbmcgdG9rZW4sXG4gICAgICAgIC8vIHNvIHRoZSBjdWxwcml0IGlzIGluZGV4LTFcbiAgICAgICAgdmFyIGJ1ZmZlciA9IHRoaXMuYnVmZmVyO1xuICAgICAgICBpZiAodHlwZW9mIGJ1ZmZlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHZhciBsaW5lcyA9IGJ1ZmZlclxuICAgICAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxuICAgICAgICAgICAgICAgIC5zbGljZShcbiAgICAgICAgICAgICAgICAgICAgTWF0aC5tYXgoMCwgdGhpcy5saW5lIC0gNSksIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB2YXIgbmV4dExpbmVCcmVhayA9IGJ1ZmZlci5pbmRleE9mKCdcXG4nLCB0aGlzLmluZGV4KTtcbiAgICAgICAgICAgIGlmIChuZXh0TGluZUJyZWFrID09PSAtMSkgbmV4dExpbmVCcmVhayA9IGJ1ZmZlci5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgY29sID0gdGhpcy5pbmRleCAtIHRoaXMubGFzdExpbmVCcmVhaztcbiAgICAgICAgICAgIHZhciBsYXN0TGluZURpZ2l0cyA9IFN0cmluZyh0aGlzLmxpbmUpLmxlbmd0aDtcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gXCIgYXQgbGluZSBcIiArIHRoaXMubGluZSArIFwiIGNvbCBcIiArIGNvbCArIFwiOlxcblxcblwiO1xuICAgICAgICAgICAgbWVzc2FnZSArPSBsaW5lc1xuICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24obGluZSwgaSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGFkKHRoaXMubGluZSAtIGxpbmVzLmxlbmd0aCArIGkgKyAxLCBsYXN0TGluZURpZ2l0cykgKyBcIiBcIiArIGxpbmU7XG4gICAgICAgICAgICAgICAgfSwgdGhpcylcbiAgICAgICAgICAgICAgICAuam9pbihcIlxcblwiKTtcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gXCJcXG5cIiArIHBhZChcIlwiLCBsYXN0TGluZURpZ2l0cyArIGNvbCkgKyBcIl5cXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBtZXNzYWdlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG1lc3NhZ2UgKyBcIiBhdCBpbmRleCBcIiArICh0aGlzLmluZGV4IC0gMSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwYWQobiwgbGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgcyA9IFN0cmluZyhuKTtcbiAgICAgICAgICAgIHJldHVybiBBcnJheShsZW5ndGggLSBzLmxlbmd0aCArIDEpLmpvaW4oXCIgXCIpICsgcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFBhcnNlcihydWxlcywgc3RhcnQsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKHJ1bGVzIGluc3RhbmNlb2YgR3JhbW1hcikge1xuICAgICAgICAgICAgdmFyIGdyYW1tYXIgPSBydWxlcztcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gc3RhcnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZ3JhbW1hciA9IEdyYW1tYXIuZnJvbUNvbXBpbGVkKHJ1bGVzLCBzdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ncmFtbWFyID0gZ3JhbW1hcjtcblxuICAgICAgICAvLyBSZWFkIG9wdGlvbnNcbiAgICAgICAgdGhpcy5vcHRpb25zID0ge1xuICAgICAgICAgICAga2VlcEhpc3Rvcnk6IGZhbHNlLFxuICAgICAgICAgICAgbGV4ZXI6IGdyYW1tYXIubGV4ZXIgfHwgbmV3IFN0cmVhbUxleGVyLFxuICAgICAgICB9O1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gKG9wdGlvbnMgfHwge30pKSB7XG4gICAgICAgICAgICB0aGlzLm9wdGlvbnNba2V5XSA9IG9wdGlvbnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldHVwIGxleGVyXG4gICAgICAgIHRoaXMubGV4ZXIgPSB0aGlzLm9wdGlvbnMubGV4ZXI7XG4gICAgICAgIHRoaXMubGV4ZXJTdGF0ZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBTZXR1cCBhIHRhYmxlXG4gICAgICAgIHZhciBjb2x1bW4gPSBuZXcgQ29sdW1uKGdyYW1tYXIsIDApO1xuICAgICAgICB2YXIgdGFibGUgPSB0aGlzLnRhYmxlID0gW2NvbHVtbl07XG5cbiAgICAgICAgLy8gSSBjb3VsZCBiZSBleHBlY3RpbmcgYW55dGhpbmcuXG4gICAgICAgIGNvbHVtbi53YW50c1tncmFtbWFyLnN0YXJ0XSA9IFtdO1xuICAgICAgICBjb2x1bW4ucHJlZGljdChncmFtbWFyLnN0YXJ0KTtcbiAgICAgICAgLy8gVE9ETyB3aGF0IGlmIHN0YXJ0IHJ1bGUgaXMgbnVsbGFibGU/XG4gICAgICAgIGNvbHVtbi5wcm9jZXNzKCk7XG4gICAgICAgIHRoaXMuY3VycmVudCA9IDA7IC8vIHRva2VuIGluZGV4XG4gICAgfVxuXG4gICAgLy8gY3JlYXRlIGEgcmVzZXJ2ZWQgdG9rZW4gZm9yIGluZGljYXRpbmcgYSBwYXJzZSBmYWlsXG4gICAgUGFyc2VyLmZhaWwgPSB7fTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUuZmVlZCA9IGZ1bmN0aW9uKGNodW5rKSB7XG4gICAgICAgIHZhciBsZXhlciA9IHRoaXMubGV4ZXI7XG4gICAgICAgIGxleGVyLnJlc2V0KGNodW5rLCB0aGlzLmxleGVyU3RhdGUpO1xuXG4gICAgICAgIHZhciB0b2tlbjtcbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBsZXhlci5uZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSBuZXh0IGNvbHVtbiBzbyB0aGF0IHRoZSBlcnJvciByZXBvcnRlclxuICAgICAgICAgICAgICAgIC8vIGNhbiBkaXNwbGF5IHRoZSBjb3JyZWN0bHkgcHJlZGljdGVkIHN0YXRlcy5cbiAgICAgICAgICAgICAgICB2YXIgbmV4dENvbHVtbiA9IG5ldyBDb2x1bW4odGhpcy5ncmFtbWFyLCB0aGlzLmN1cnJlbnQgKyAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlLnB1c2gobmV4dENvbHVtbik7XG4gICAgICAgICAgICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcih0aGlzLnJlcG9ydExleGVyRXJyb3IoZSkpO1xuICAgICAgICAgICAgICAgIGVyci5vZmZzZXQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgICAgICAgICAgICAgZXJyLnRva2VuID0gZS50b2tlbjtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBXZSBhZGQgbmV3IHN0YXRlcyB0byB0YWJsZVtjdXJyZW50KzFdXG4gICAgICAgICAgICB2YXIgY29sdW1uID0gdGhpcy50YWJsZVt0aGlzLmN1cnJlbnRdO1xuXG4gICAgICAgICAgICAvLyBHQyB1bnVzZWQgc3RhdGVzXG4gICAgICAgICAgICBpZiAoIXRoaXMub3B0aW9ucy5rZWVwSGlzdG9yeSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnRhYmxlW3RoaXMuY3VycmVudCAtIDFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuY3VycmVudCArIDE7XG4gICAgICAgICAgICB2YXIgbmV4dENvbHVtbiA9IG5ldyBDb2x1bW4odGhpcy5ncmFtbWFyLCBuKTtcbiAgICAgICAgICAgIHRoaXMudGFibGUucHVzaChuZXh0Q29sdW1uKTtcblxuICAgICAgICAgICAgLy8gQWR2YW5jZSBhbGwgdG9rZW5zIHRoYXQgZXhwZWN0IHRoZSBzeW1ib2xcbiAgICAgICAgICAgIHZhciBsaXRlcmFsID0gdG9rZW4udGV4dCAhPT0gdW5kZWZpbmVkID8gdG9rZW4udGV4dCA6IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gbGV4ZXIuY29uc3RydWN0b3IgPT09IFN0cmVhbUxleGVyID8gdG9rZW4udmFsdWUgOiB0b2tlbjtcbiAgICAgICAgICAgIHZhciBzY2FubmFibGUgPSBjb2x1bW4uc2Nhbm5hYmxlO1xuICAgICAgICAgICAgZm9yICh2YXIgdyA9IHNjYW5uYWJsZS5sZW5ndGg7IHctLTsgKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc2Nhbm5hYmxlW3ddO1xuICAgICAgICAgICAgICAgIHZhciBleHBlY3QgPSBzdGF0ZS5ydWxlLnN5bWJvbHNbc3RhdGUuZG90XTtcbiAgICAgICAgICAgICAgICAvLyBUcnkgdG8gY29uc3VtZSB0aGUgdG9rZW5cbiAgICAgICAgICAgICAgICAvLyBlaXRoZXIgcmVnZXggb3IgbGl0ZXJhbFxuICAgICAgICAgICAgICAgIGlmIChleHBlY3QudGVzdCA/IGV4cGVjdC50ZXN0KHZhbHVlKSA6XG4gICAgICAgICAgICAgICAgICAgIGV4cGVjdC50eXBlID8gZXhwZWN0LnR5cGUgPT09IHRva2VuLnR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBleHBlY3QubGl0ZXJhbCA9PT0gbGl0ZXJhbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgaXRcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHQgPSBzdGF0ZS5uZXh0U3RhdGUoe2RhdGE6IHZhbHVlLCB0b2tlbjogdG9rZW4sIGlzVG9rZW46IHRydWUsIHJlZmVyZW5jZTogbiAtIDF9KTtcbiAgICAgICAgICAgICAgICAgICAgbmV4dENvbHVtbi5zdGF0ZXMucHVzaChuZXh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5leHQsIGZvciBlYWNoIG9mIHRoZSBydWxlcywgd2UgZWl0aGVyXG4gICAgICAgICAgICAvLyAoYSkgY29tcGxldGUgaXQsIGFuZCB0cnkgdG8gc2VlIGlmIHRoZSByZWZlcmVuY2Ugcm93IGV4cGVjdGVkIHRoYXRcbiAgICAgICAgICAgIC8vICAgICBydWxlXG4gICAgICAgICAgICAvLyAoYikgcHJlZGljdCB0aGUgbmV4dCBub250ZXJtaW5hbCBpdCBleHBlY3RzIGJ5IGFkZGluZyB0aGF0XG4gICAgICAgICAgICAvLyAgICAgbm9udGVybWluYWwncyBzdGFydCBzdGF0ZVxuICAgICAgICAgICAgLy8gVG8gcHJldmVudCBkdXBsaWNhdGlvbiwgd2UgYWxzbyBrZWVwIHRyYWNrIG9mIHJ1bGVzIHdlIGhhdmUgYWxyZWFkeVxuICAgICAgICAgICAgLy8gYWRkZWRcblxuICAgICAgICAgICAgbmV4dENvbHVtbi5wcm9jZXNzKCk7XG5cbiAgICAgICAgICAgIC8vIElmIG5lZWRlZCwgdGhyb3cgYW4gZXJyb3I6XG4gICAgICAgICAgICBpZiAobmV4dENvbHVtbi5zdGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgLy8gTm8gc3RhdGVzIGF0IGFsbCEgVGhpcyBpcyBub3QgZ29vZC5cbiAgICAgICAgICAgICAgICB2YXIgZXJyID0gbmV3IEVycm9yKHRoaXMucmVwb3J0RXJyb3IodG9rZW4pKTtcbiAgICAgICAgICAgICAgICBlcnIub2Zmc2V0ID0gdGhpcy5jdXJyZW50O1xuICAgICAgICAgICAgICAgIGVyci50b2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbWF5YmUgc2F2ZSBsZXhlciBzdGF0ZVxuICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5rZWVwSGlzdG9yeSkge1xuICAgICAgICAgICAgICBjb2x1bW4ubGV4ZXJTdGF0ZSA9IGxleGVyLnNhdmUoKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnQrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sdW1uKSB7XG4gICAgICAgICAgdGhpcy5sZXhlclN0YXRlID0gbGV4ZXIuc2F2ZSgpXG4gICAgICAgIH1cblxuICAgICAgICAvLyBJbmNyZW1lbnRhbGx5IGtlZXAgdHJhY2sgb2YgcmVzdWx0c1xuICAgICAgICB0aGlzLnJlc3VsdHMgPSB0aGlzLmZpbmlzaCgpO1xuXG4gICAgICAgIC8vIEFsbG93IGNoYWluaW5nLCBmb3Igd2hhdGV2ZXIgaXQncyB3b3J0aFxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5yZXBvcnRMZXhlckVycm9yID0gZnVuY3Rpb24obGV4ZXJFcnJvcikge1xuICAgICAgICB2YXIgdG9rZW5EaXNwbGF5LCBsZXhlck1lc3NhZ2U7XG4gICAgICAgIC8vIFBsYW5uaW5nIHRvIGFkZCBhIHRva2VuIHByb3BlcnR5IHRvIG1vbydzIHRocm93biBlcnJvclxuICAgICAgICAvLyBldmVuIG9uIGVycm9yaW5nIHRva2VucyB0byBiZSB1c2VkIGluIGVycm9yIGRpc3BsYXkgYmVsb3dcbiAgICAgICAgdmFyIHRva2VuID0gbGV4ZXJFcnJvci50b2tlbjtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICB0b2tlbkRpc3BsYXkgPSBcImlucHV0IFwiICsgSlNPTi5zdHJpbmdpZnkodG9rZW4udGV4dFswXSkgKyBcIiAobGV4ZXIgZXJyb3IpXCI7XG4gICAgICAgICAgICBsZXhlck1lc3NhZ2UgPSB0aGlzLmxleGVyLmZvcm1hdEVycm9yKHRva2VuLCBcIlN5bnRheCBlcnJvclwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRva2VuRGlzcGxheSA9IFwiaW5wdXQgKGxleGVyIGVycm9yKVwiO1xuICAgICAgICAgICAgbGV4ZXJNZXNzYWdlID0gbGV4ZXJFcnJvci5tZXNzYWdlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnJlcG9ydEVycm9yQ29tbW9uKGxleGVyTWVzc2FnZSwgdG9rZW5EaXNwbGF5KTtcbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5yZXBvcnRFcnJvciA9IGZ1bmN0aW9uKHRva2VuKSB7XG4gICAgICAgIHZhciB0b2tlbkRpc3BsYXkgPSAodG9rZW4udHlwZSA/IHRva2VuLnR5cGUgKyBcIiB0b2tlbjogXCIgOiBcIlwiKSArIEpTT04uc3RyaW5naWZ5KHRva2VuLnZhbHVlICE9PSB1bmRlZmluZWQgPyB0b2tlbi52YWx1ZSA6IHRva2VuKTtcbiAgICAgICAgdmFyIGxleGVyTWVzc2FnZSA9IHRoaXMubGV4ZXIuZm9ybWF0RXJyb3IodG9rZW4sIFwiU3ludGF4IGVycm9yXCIpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZXBvcnRFcnJvckNvbW1vbihsZXhlck1lc3NhZ2UsIHRva2VuRGlzcGxheSk7XG4gICAgfTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUucmVwb3J0RXJyb3JDb21tb24gPSBmdW5jdGlvbihsZXhlck1lc3NhZ2UsIHRva2VuRGlzcGxheSkge1xuICAgICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgICAgbGluZXMucHVzaChsZXhlck1lc3NhZ2UpO1xuICAgICAgICB2YXIgbGFzdENvbHVtbkluZGV4ID0gdGhpcy50YWJsZS5sZW5ndGggLSAyO1xuICAgICAgICB2YXIgbGFzdENvbHVtbiA9IHRoaXMudGFibGVbbGFzdENvbHVtbkluZGV4XTtcbiAgICAgICAgdmFyIGV4cGVjdGFudFN0YXRlcyA9IGxhc3RDb2x1bW4uc3RhdGVzXG4gICAgICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uKHN0YXRlKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5leHRTeW1ib2wgPSBzdGF0ZS5ydWxlLnN5bWJvbHNbc3RhdGUuZG90XTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV4dFN5bWJvbCAmJiB0eXBlb2YgbmV4dFN5bWJvbCAhPT0gXCJzdHJpbmdcIjtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChleHBlY3RhbnRTdGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCdVbmV4cGVjdGVkICcgKyB0b2tlbkRpc3BsYXkgKyAnLiBJIGRpZCBub3QgZXhwZWN0IGFueSBtb3JlIGlucHV0LiBIZXJlIGlzIHRoZSBzdGF0ZSBvZiBteSBwYXJzZSB0YWJsZTpcXG4nKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheVN0YXRlU3RhY2sobGFzdENvbHVtbi5zdGF0ZXMsIGxpbmVzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJ1VuZXhwZWN0ZWQgJyArIHRva2VuRGlzcGxheSArICcuIEluc3RlYWQsIEkgd2FzIGV4cGVjdGluZyB0byBzZWUgb25lIG9mIHRoZSBmb2xsb3dpbmc6XFxuJyk7XG4gICAgICAgICAgICAvLyBEaXNwbGF5IGEgXCJzdGF0ZSBzdGFja1wiIGZvciBlYWNoIGV4cGVjdGFudCBzdGF0ZVxuICAgICAgICAgICAgLy8gLSB3aGljaCBzaG93cyB5b3UgaG93IHRoaXMgc3RhdGUgY2FtZSB0byBiZSwgc3RlcCBieSBzdGVwLlxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBkZXJpdmF0aW9uLCB3ZSBvbmx5IGRpc3BsYXkgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIHZhciBzdGF0ZVN0YWNrcyA9IGV4cGVjdGFudFN0YXRlc1xuICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24oc3RhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRGaXJzdFN0YXRlU3RhY2soc3RhdGUsIFtdKSB8fCBbc3RhdGVdO1xuICAgICAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICAgICAgLy8gRGlzcGxheSBlYWNoIHN0YXRlIHRoYXQgaXMgZXhwZWN0aW5nIGEgdGVybWluYWwgc3ltYm9sIG5leHQuXG4gICAgICAgICAgICBzdGF0ZVN0YWNrcy5mb3JFYWNoKGZ1bmN0aW9uKHN0YXRlU3RhY2spIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdGF0ZVN0YWNrWzBdO1xuICAgICAgICAgICAgICAgIHZhciBuZXh0U3ltYm9sID0gc3RhdGUucnVsZS5zeW1ib2xzW3N0YXRlLmRvdF07XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbERpc3BsYXkgPSB0aGlzLmdldFN5bWJvbERpc3BsYXkobmV4dFN5bWJvbCk7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCgnQSAnICsgc3ltYm9sRGlzcGxheSArICcgYmFzZWQgb246Jyk7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5U3RhdGVTdGFjayhzdGF0ZVN0YWNrLCBsaW5lcyk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBsaW5lcy5wdXNoKFwiXCIpO1xuICAgICAgICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcbiAgICB9XG4gICAgXG4gICAgUGFyc2VyLnByb3RvdHlwZS5kaXNwbGF5U3RhdGVTdGFjayA9IGZ1bmN0aW9uKHN0YXRlU3RhY2ssIGxpbmVzKSB7XG4gICAgICAgIHZhciBsYXN0RGlzcGxheTtcbiAgICAgICAgdmFyIHNhbWVEaXNwbGF5Q291bnQgPSAwO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHN0YXRlU3RhY2subGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0YXRlU3RhY2tbal07XG4gICAgICAgICAgICB2YXIgZGlzcGxheSA9IHN0YXRlLnJ1bGUudG9TdHJpbmcoc3RhdGUuZG90KTtcbiAgICAgICAgICAgIGlmIChkaXNwbGF5ID09PSBsYXN0RGlzcGxheSkge1xuICAgICAgICAgICAgICAgIHNhbWVEaXNwbGF5Q291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHNhbWVEaXNwbGF5Q291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJyAgICBeICcgKyBzYW1lRGlzcGxheUNvdW50ICsgJyBtb3JlIGxpbmVzIGlkZW50aWNhbCB0byB0aGlzJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNhbWVEaXNwbGF5Q291bnQgPSAwO1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJyAgICAnICsgZGlzcGxheSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0RGlzcGxheSA9IGRpc3BsYXk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5nZXRTeW1ib2xEaXNwbGF5ID0gZnVuY3Rpb24oc3ltYm9sKSB7XG4gICAgICAgIHJldHVybiBnZXRTeW1ib2xMb25nRGlzcGxheShzeW1ib2wpO1xuICAgIH07XG5cbiAgICAvKlxuICAgIEJ1aWxkcyBhIHRoZSBmaXJzdCBzdGF0ZSBzdGFjay4gWW91IGNhbiB0aGluayBvZiBhIHN0YXRlIHN0YWNrIGFzIHRoZSBjYWxsIHN0YWNrXG4gICAgb2YgdGhlIHJlY3Vyc2l2ZS1kZXNjZW50IHBhcnNlciB3aGljaCB0aGUgTmVhcmxleSBwYXJzZSBhbGdvcml0aG0gc2ltdWxhdGVzLlxuICAgIEEgc3RhdGUgc3RhY2sgaXMgcmVwcmVzZW50ZWQgYXMgYW4gYXJyYXkgb2Ygc3RhdGUgb2JqZWN0cy4gV2l0aGluIGFcbiAgICBzdGF0ZSBzdGFjaywgdGhlIGZpcnN0IGl0ZW0gb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIHN0YXJ0aW5nXG4gICAgc3RhdGUsIHdpdGggZWFjaCBzdWNjZXNzaXZlIGl0ZW0gaW4gdGhlIGFycmF5IGdvaW5nIGZ1cnRoZXIgYmFjayBpbnRvIGhpc3RvcnkuXG5cbiAgICBUaGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIGdpdmVuIGEgc3RhcnRpbmcgc3RhdGUgYW5kIGFuIGVtcHR5IGFycmF5IHJlcHJlc2VudGluZ1xuICAgIHRoZSB2aXNpdGVkIHN0YXRlcywgYW5kIGl0IHJldHVybnMgYW4gc2luZ2xlIHN0YXRlIHN0YWNrLlxuXG4gICAgKi9cbiAgICBQYXJzZXIucHJvdG90eXBlLmJ1aWxkRmlyc3RTdGF0ZVN0YWNrID0gZnVuY3Rpb24oc3RhdGUsIHZpc2l0ZWQpIHtcbiAgICAgICAgaWYgKHZpc2l0ZWQuaW5kZXhPZihzdGF0ZSkgIT09IC0xKSB7XG4gICAgICAgICAgICAvLyBGb3VuZCBjeWNsZSwgcmV0dXJuIG51bGxcbiAgICAgICAgICAgIC8vIHRvIGVsaW1pbmF0ZSB0aGlzIHBhdGggZnJvbSB0aGUgcmVzdWx0cywgYmVjYXVzZVxuICAgICAgICAgICAgLy8gd2UgZG9uJ3Qga25vdyBob3cgdG8gZGlzcGxheSBpdCBtZWFuaW5nZnVsbHlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0ZS53YW50ZWRCeS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbc3RhdGVdO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwcmV2U3RhdGUgPSBzdGF0ZS53YW50ZWRCeVswXTtcbiAgICAgICAgdmFyIGNoaWxkVmlzaXRlZCA9IFtzdGF0ZV0uY29uY2F0KHZpc2l0ZWQpO1xuICAgICAgICB2YXIgY2hpbGRSZXN1bHQgPSB0aGlzLmJ1aWxkRmlyc3RTdGF0ZVN0YWNrKHByZXZTdGF0ZSwgY2hpbGRWaXNpdGVkKTtcbiAgICAgICAgaWYgKGNoaWxkUmVzdWx0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW3N0YXRlXS5jb25jYXQoY2hpbGRSZXN1bHQpO1xuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMudGFibGVbdGhpcy5jdXJyZW50XTtcbiAgICAgICAgY29sdW1uLmxleGVyU3RhdGUgPSB0aGlzLmxleGVyU3RhdGU7XG4gICAgICAgIHJldHVybiBjb2x1bW47XG4gICAgfTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUucmVzdG9yZSA9IGZ1bmN0aW9uKGNvbHVtbikge1xuICAgICAgICB2YXIgaW5kZXggPSBjb2x1bW4uaW5kZXg7XG4gICAgICAgIHRoaXMuY3VycmVudCA9IGluZGV4O1xuICAgICAgICB0aGlzLnRhYmxlW2luZGV4XSA9IGNvbHVtbjtcbiAgICAgICAgdGhpcy50YWJsZS5zcGxpY2UoaW5kZXggKyAxKTtcbiAgICAgICAgdGhpcy5sZXhlclN0YXRlID0gY29sdW1uLmxleGVyU3RhdGU7XG5cbiAgICAgICAgLy8gSW5jcmVtZW50YWxseSBrZWVwIHRyYWNrIG9mIHJlc3VsdHNcbiAgICAgICAgdGhpcy5yZXN1bHRzID0gdGhpcy5maW5pc2goKTtcbiAgICB9O1xuXG4gICAgLy8gbmIuIGRlcHJlY2F0ZWQ6IHVzZSBzYXZlL3Jlc3RvcmUgaW5zdGVhZCFcbiAgICBQYXJzZXIucHJvdG90eXBlLnJld2luZCA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAgIGlmICghdGhpcy5vcHRpb25zLmtlZXBIaXN0b3J5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldCBvcHRpb24gYGtlZXBIaXN0b3J5YCB0byBlbmFibGUgcmV3aW5kaW5nJylcbiAgICAgICAgfVxuICAgICAgICAvLyBuYi4gcmVjYWxsIGNvbHVtbiAodGFibGUpIGluZGljaWVzIGZhbGwgYmV0d2VlbiB0b2tlbiBpbmRpY2llcy5cbiAgICAgICAgLy8gICAgICAgIGNvbCAwICAgLS0gICB0b2tlbiAwICAgLS0gICBjb2wgMVxuICAgICAgICB0aGlzLnJlc3RvcmUodGhpcy50YWJsZVtpbmRleF0pO1xuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLmZpbmlzaCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBSZXR1cm4gdGhlIHBvc3NpYmxlIHBhcnNpbmdzXG4gICAgICAgIHZhciBjb25zaWRlcmF0aW9ucyA9IFtdO1xuICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLmdyYW1tYXIuc3RhcnQ7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLnRhYmxlW3RoaXMudGFibGUubGVuZ3RoIC0gMV1cbiAgICAgICAgY29sdW1uLnN0YXRlcy5mb3JFYWNoKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgICAgICBpZiAodC5ydWxlLm5hbWUgPT09IHN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICYmIHQuZG90ID09PSB0LnJ1bGUuc3ltYm9scy5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgJiYgdC5yZWZlcmVuY2UgPT09IDBcbiAgICAgICAgICAgICAgICAgICAgJiYgdC5kYXRhICE9PSBQYXJzZXIuZmFpbCkge1xuICAgICAgICAgICAgICAgIGNvbnNpZGVyYXRpb25zLnB1c2godCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY29uc2lkZXJhdGlvbnMubWFwKGZ1bmN0aW9uKGMpIHtyZXR1cm4gYy5kYXRhOyB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZ2V0U3ltYm9sTG9uZ0Rpc3BsYXkoc3ltYm9sKSB7XG4gICAgICAgIHZhciB0eXBlID0gdHlwZW9mIHN5bWJvbDtcbiAgICAgICAgaWYgKHR5cGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBzeW1ib2w7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKHN5bWJvbC5saXRlcmFsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHN5bWJvbC5saXRlcmFsKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdjaGFyYWN0ZXIgbWF0Y2hpbmcgJyArIHN5bWJvbDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3ltYm9sLnR5cGUgKyAnIHRva2VuJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnRlc3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3Rva2VuIG1hdGNoaW5nICcgKyBTdHJpbmcoc3ltYm9sLnRlc3QpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gc3ltYm9sIHR5cGU6ICcgKyBzeW1ib2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U3ltYm9sU2hvcnREaXNwbGF5KHN5bWJvbCkge1xuICAgICAgICB2YXIgdHlwZSA9IHR5cGVvZiBzeW1ib2w7XG4gICAgICAgIGlmICh0eXBlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gc3ltYm9sO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmIChzeW1ib2wubGl0ZXJhbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShzeW1ib2wubGl0ZXJhbCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN5bWJvbCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzeW1ib2wudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyUnICsgc3ltYm9sLnR5cGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN5bWJvbC50ZXN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICc8JyArIFN0cmluZyhzeW1ib2wudGVzdCkgKyAnPic7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBzeW1ib2wgdHlwZTogJyArIHN5bWJvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBQYXJzZXI6IFBhcnNlcixcbiAgICAgICAgR3JhbW1hcjogR3JhbW1hcixcbiAgICAgICAgUnVsZTogUnVsZSxcbiAgICB9O1xuXG59KSk7XG4iLCIvLyBHZW5lcmF0ZWQgYXV0b21hdGljYWxseSBieSBuZWFybGV5LCB2ZXJzaW9uIDIuMjAuMVxuLy8gaHR0cDovL2dpdGh1Yi5jb20vSGFyZG1hdGgxMjMvbmVhcmxleVxuKGZ1bmN0aW9uICgpIHtcbmZ1bmN0aW9uIGlkKHgpIHsgcmV0dXJuIHhbMF07IH1cbnZhciBncmFtbWFyID0ge1xuICAgIExleGVyOiB1bmRlZmluZWQsXG4gICAgUGFyc2VyUnVsZXM6IFtcbiAgICB7XCJuYW1lXCI6IFwiXyRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdfSxcbiAgICB7XCJuYW1lXCI6IFwiXyRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcIl8kZWJuZiQxXCIsIFwid3NjaGFyXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJfXCIsIFwic3ltYm9sc1wiOiBbXCJfJGVibmYkMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcIl9fJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wid3NjaGFyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwiX18kZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJfXyRlYm5mJDFcIiwgXCJ3c2NoYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gYXJycHVzaChkKSB7cmV0dXJuIGRbMF0uY29uY2F0KFtkWzFdXSk7fX0sXG4gICAge1wibmFtZVwiOiBcIl9fXCIsIFwic3ltYm9sc1wiOiBbXCJfXyRlYm5mJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ3c2NoYXJcIiwgXCJzeW1ib2xzXCI6IFsvWyBcXHRcXG5cXHZcXGZdL10sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1bnNpZ25lZF9pbnQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbL1swLTldL119LFxuICAgIHtcIm5hbWVcIjogXCJ1bnNpZ25lZF9pbnQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJ1bnNpZ25lZF9pbnQkZWJuZiQxXCIsIC9bMC05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJ1bnNpZ25lZF9pbnRcIiwgXCJzeW1ib2xzXCI6IFtcInVuc2lnbmVkX2ludCRlYm5mJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogXG4gICAgICAgIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUludChkWzBdLmpvaW4oXCJcIikpO1xuICAgICAgICB9XG4gICAgICAgIH0sXG4gICAge1wibmFtZVwiOiBcImludCRlYm5mJDEkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifV19LFxuICAgIHtcIm5hbWVcIjogXCJpbnQkZWJuZiQxJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIitcIn1dfSxcbiAgICB7XCJuYW1lXCI6IFwiaW50JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiaW50JGVibmYkMSRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJpbnQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImludCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcImludCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcImludCRlYm5mJDJcIiwgL1swLTldL10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gYXJycHVzaChkKSB7cmV0dXJuIGRbMF0uY29uY2F0KFtkWzFdXSk7fX0sXG4gICAge1wibmFtZVwiOiBcImludFwiLCBcInN5bWJvbHNcIjogW1wiaW50JGVibmYkMVwiLCBcImludCRlYm5mJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogXG4gICAgICAgIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIGlmIChkWzBdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KGRbMF1bMF0rZFsxXS5qb2luKFwiXCIpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KGRbMV0uam9pbihcIlwiKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgfSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJ1bnNpZ25lZF9kZWNpbWFsJGVibmYkMVwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogWy9bMC05XS9dfSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1widW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwgXCJ1bnNpZ25lZF9kZWNpbWFsJGVibmYkMiRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQyJHN1YmV4cHJlc3Npb24kMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInVuc2lnbmVkX2RlY2ltYWxcIiwgXCJzeW1ib2xzXCI6IFtcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQxXCIsIFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogXG4gICAgICAgIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KFxuICAgICAgICAgICAgICAgIGRbMF0uam9pbihcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbMV0gPyBcIi5cIitkWzFdWzFdLmpvaW4oXCJcIikgOiBcIlwiKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB9LFxuICAgIHtcIm5hbWVcIjogXCJkZWNpbWFsJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi1cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcImRlY2ltYWwkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNpbWFsJGVibmYkMlwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogWy9bMC05XS9dfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwgXCJkZWNpbWFsJGVibmYkMyRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDNcIiwgXCJzeW1ib2xzXCI6IFtcImRlY2ltYWwkZWJuZiQzJHN1YmV4cHJlc3Npb24kMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImRlY2ltYWwkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImRlY2ltYWxcIiwgXCJzeW1ib2xzXCI6IFtcImRlY2ltYWwkZWJuZiQxXCIsIFwiZGVjaW1hbCRlYm5mJDJcIiwgXCJkZWNpbWFsJGVibmYkM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBcbiAgICAgICAgZnVuY3Rpb24oZCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoXG4gICAgICAgICAgICAgICAgKGRbMF0gfHwgXCJcIikgK1xuICAgICAgICAgICAgICAgIGRbMV0uam9pbihcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbMl0gPyBcIi5cIitkWzJdWzFdLmpvaW4oXCJcIikgOiBcIlwiKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB9LFxuICAgIHtcIm5hbWVcIjogXCJwZXJjZW50YWdlXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNpbWFsXCIsIHtcImxpdGVyYWxcIjpcIiVcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IFxuICAgICAgICBmdW5jdGlvbihkKSB7XG4gICAgICAgICAgICByZXR1cm4gZFswXS8xMDA7XG4gICAgICAgIH1cbiAgICAgICAgfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi1cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbL1swLTldL119LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJqc29uZmxvYXQkZWJuZiQyXCIsIC9bMC05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQzJHN1YmV4cHJlc3Npb24kMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcImpzb25mbG9hdCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkMyRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCIsIC9bMC05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQzJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi5cIn0sIFwianNvbmZsb2F0JGVibmYkMyRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkM1wiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkMyRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImpzb25mbG9hdCRlYm5mJDQkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogWy9bKy1dL10sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQ0JHN1YmV4cHJlc3Npb24kMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDEkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbL1swLTldL119LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQ0JHN1YmV4cHJlc3Npb24kMSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcImpzb25mbG9hdCRlYm5mJDQkc3ViZXhwcmVzc2lvbiQxJGVibmYkMlwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFsvW2VFXS8sIFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCIsIFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDEkZWJuZiQyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkNFwiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQ0XCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImpzb25mbG9hdFwiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkMVwiLCBcImpzb25mbG9hdCRlYm5mJDJcIiwgXCJqc29uZmxvYXQkZWJuZiQzXCIsIFwianNvbmZsb2F0JGVibmYkNFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBcbiAgICAgICAgZnVuY3Rpb24oZCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoXG4gICAgICAgICAgICAgICAgKGRbMF0gfHwgXCJcIikgK1xuICAgICAgICAgICAgICAgIGRbMV0uam9pbihcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbMl0gPyBcIi5cIitkWzJdWzFdLmpvaW4oXCJcIikgOiBcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbM10gPyBcImVcIiArIChkWzNdWzFdIHx8IFwiK1wiKSArIGRbM11bMl0uam9pbihcIlwiKSA6IFwiXCIpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIH0sXG4gICAge1wibmFtZVwiOiBcImVxdWF0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJfXCIsIFwiZXhwcmVzc2lvblwiLCBcIl9cIl0sIFwicG9zdHByb2Nlc3NcIjogKGRhdGEpID0+IGRhdGFbMV19LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uXCIsIFwic3ltYm9sc1wiOiBbXCJleHByZXNzaW9uX0FcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0Ekc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiK1wifV19LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0Ekc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifV19LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0FcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fQVwiLCBcIl9cIiwgXCJleHByZXNzaW9uX0Ekc3ViZXhwcmVzc2lvbiQxXCIsIFwiX1wiLCBcImV4cHJlc3Npb25fQlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdvcGVyYXRpb24nLFxyXG4gICAgICAgICAgICBvcDogZGF0YVsyXVswXSxcclxuICAgICAgICAgICAgbGhzOiBkYXRhWzBdLFxyXG4gICAgICAgICAgICByaHM6IGRhdGFbNF1cclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0FcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fQlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQiRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIqXCJ9XX0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQiRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIvXCJ9XX0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQlwiLCBcInN5bWJvbHNcIjogW1wiZXhwcmVzc2lvbl9CXCIsIFwiX1wiLCBcImV4cHJlc3Npb25fQiRzdWJleHByZXNzaW9uJDFcIiwgXCJfXCIsIFwiZXhwcmVzc2lvbl9DXCJdLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ29wZXJhdGlvbicsXHJcbiAgICAgICAgICAgIG9wOiBkYXRhWzJdWzBdLFxyXG4gICAgICAgICAgICBsaHM6IGRhdGFbMF0sXHJcbiAgICAgICAgICAgIHJoczogZGF0YVs0XVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQlwiLCBcInN5bWJvbHNcIjogW1wiZXhwcmVzc2lvbl9DXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwcmVzc2lvbl9DXCIsIFwic3ltYm9sc1wiOiBbXCJleHByZXNzaW9uX0NcIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIl5cIn0sIFwiX1wiLCBcImV4cHJlc3Npb25fRFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdvcGVyYXRpb24nLFxyXG4gICAgICAgICAgICBvcDogZGF0YVsyXSxcclxuICAgICAgICAgICAgbGhzOiBkYXRhWzBdLFxyXG4gICAgICAgICAgICByaHM6IGRhdGFbNF1cclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0NcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fRFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdfSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwcmVzc2lvbl9EJGVibmYkMSRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIsXCJ9LCBcIl9cIiwgXCJleHByZXNzaW9uXCIsIFwiX1wiXX0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJleHByZXNzaW9uX0QkZWJuZiQxJHN1YmV4cHJlc3Npb24kMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwcmVzc2lvbl9EXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvblwiLCB7XCJsaXRlcmFsXCI6XCIoXCJ9LCBcIl9cIiwgXCJleHByZXNzaW9uXCIsIFwiX1wiLCBcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIilcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ2Z1bmN0aW9uJyxcclxuICAgICAgICAgICAgZnVuY3Rpb246IGRhdGFbMF0sXHJcbiAgICAgICAgICAgIGFyZ3M6IFtkYXRhWzNdLCAuLi5kYXRhWzVdLm1hcChkYXRhID0+IGRhdGFbMl0pXVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fRFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIihcIn0sIFwiX1wiLCBcImV4cHJlc3Npb25cIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIilcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IChkYXRhKSA9PiAoZGF0YVsyXSl9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0RcIiwgXCJzeW1ib2xzXCI6IFtcInRva2VuXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFtcImludFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInLFxyXG4gICAgICAgICAgICByZTogZGF0YVswXSxcclxuICAgICAgICAgICAgaW06IDBcclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJ0b2tlblwiLCBcInN5bWJvbHNcIjogW1wiZGVjaW1hbFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInLFxyXG4gICAgICAgICAgICByZTogZGF0YVswXSxcclxuICAgICAgICAgICAgaW06IDBcclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJ0b2tlblwiLCBcInN5bWJvbHNcIjogW1wiaW50XCIsIHtcImxpdGVyYWxcIjpcImlcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ251bWJlcicsXHJcbiAgICAgICAgICAgIHJlOiAwLFxyXG4gICAgICAgICAgICBpbTogZGF0YVswXVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNpbWFsXCIsIHtcImxpdGVyYWxcIjpcImlcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ251bWJlcicsXHJcbiAgICAgICAgICAgIHJlOiAwLFxyXG4gICAgICAgICAgICBpbTogZGF0YVswXVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiaVwifV0sIFwicG9zdHByb2Nlc3NcIjogIChkYXRhKSA9PiAoe1xyXG4gICAgICAgICAgICB0eXBlOiAnbnVtYmVyJyxcclxuICAgICAgICAgICAgcmU6IDAsXHJcbiAgICAgICAgICAgIGltOiAxXHJcbiAgICAgICAgfSkgfSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ6XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwielwifSwge1wibGl0ZXJhbFwiOlwiJ1wifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFtcInRva2VuJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ0XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiZVwifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ0b2tlbiRzdHJpbmckMlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcInBcIn0sIHtcImxpdGVyYWxcIjpcImlcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbXCJ0b2tlbiRzdHJpbmckMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwic1wifSwge1wibGl0ZXJhbFwiOlwicVwifSwge1wibGl0ZXJhbFwiOlwiclwifSwge1wibGl0ZXJhbFwiOlwidFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJsXCJ9LCB7XCJsaXRlcmFsXCI6XCJvXCJ9LCB7XCJsaXRlcmFsXCI6XCJnXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckM1wiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcInNcIn0sIHtcImxpdGVyYWxcIjpcImlcIn0sIHtcImxpdGVyYWxcIjpcIm5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQ0XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiY1wifSwge1wibGl0ZXJhbFwiOlwib1wifSwge1wibGl0ZXJhbFwiOlwic1wifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQ0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDVcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ0XCJ9LCB7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJuXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDVcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckNlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcInNcIn0sIHtcImxpdGVyYWxcIjpcImlcIn0sIHtcImxpdGVyYWxcIjpcIm5cIn0sIHtcImxpdGVyYWxcIjpcImhcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckNlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQ3XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiY1wifSwge1wibGl0ZXJhbFwiOlwib1wifSwge1wibGl0ZXJhbFwiOlwic1wifSwge1wibGl0ZXJhbFwiOlwiaFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQ3XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDhcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ0XCJ9LCB7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJuXCJ9LCB7XCJsaXRlcmFsXCI6XCJoXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDhcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckOVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcImFcIn0sIHtcImxpdGVyYWxcIjpcInNcIn0sIHtcImxpdGVyYWxcIjpcImlcIn0sIHtcImxpdGVyYWxcIjpcIm5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckOVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQxMFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcImFcIn0sIHtcImxpdGVyYWxcIjpcImNcIn0sIHtcImxpdGVyYWxcIjpcIm9cIn0sIHtcImxpdGVyYWxcIjpcInNcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckMTBcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckMTFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJ0XCJ9LCB7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJuXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDExXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDEyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiaVwifSwge1wibGl0ZXJhbFwiOlwidFwifSwge1wibGl0ZXJhbFwiOlwiZVwifSwge1wibGl0ZXJhbFwiOlwiclwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQxMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQxM1wiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcImdcIn0sIHtcImxpdGVyYWxcIjpcImFcIn0sIHtcImxpdGVyYWxcIjpcIm1cIn0sIHtcImxpdGVyYWxcIjpcIm1cIn0sIHtcImxpdGVyYWxcIjpcImFcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckMTNcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJvcGVyYXRvclwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIl5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwib3BlcmF0b3JcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIqXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIm9wZXJhdG9yXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiL1wifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJvcGVyYXRvclwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIitcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwib3BlcmF0b3JcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCItXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH1cbl1cbiAgLCBQYXJzZXJTdGFydDogXCJlcXVhdGlvblwiXG59XG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICBtb2R1bGUuZXhwb3J0cyA9IGdyYW1tYXI7XG59IGVsc2Uge1xuICAgd2luZG93LmdyYW1tYXIgPSBncmFtbWFyO1xufVxufSkoKTtcbiIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIvLyBnZXREZWZhdWx0RXhwb3J0IGZ1bmN0aW9uIGZvciBjb21wYXRpYmlsaXR5IHdpdGggbm9uLWhhcm1vbnkgbW9kdWxlc1xuX193ZWJwYWNrX3JlcXVpcmVfXy5uID0gKG1vZHVsZSkgPT4ge1xuXHR2YXIgZ2V0dGVyID0gbW9kdWxlICYmIG1vZHVsZS5fX2VzTW9kdWxlID9cblx0XHQoKSA9PiAobW9kdWxlWydkZWZhdWx0J10pIDpcblx0XHQoKSA9PiAobW9kdWxlKTtcblx0X193ZWJwYWNrX3JlcXVpcmVfXy5kKGdldHRlciwgeyBhOiBnZXR0ZXIgfSk7XG5cdHJldHVybiBnZXR0ZXI7XG59OyIsIi8vIGRlZmluZSBnZXR0ZXIgZnVuY3Rpb25zIGZvciBoYXJtb255IGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uZCA9IChleHBvcnRzLCBkZWZpbml0aW9uKSA9PiB7XG5cdGZvcih2YXIga2V5IGluIGRlZmluaXRpb24pIHtcblx0XHRpZihfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZGVmaW5pdGlvbiwga2V5KSAmJiAhX193ZWJwYWNrX3JlcXVpcmVfXy5vKGV4cG9ydHMsIGtleSkpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBrZXksIHsgZW51bWVyYWJsZTogdHJ1ZSwgZ2V0OiBkZWZpbml0aW9uW2tleV0gfSk7XG5cdFx0fVxuXHR9XG59OyIsIl9fd2VicGFja19yZXF1aXJlX18ubyA9IChvYmosIHByb3ApID0+IChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKSkiLCIvLyBkZWZpbmUgX19lc01vZHVsZSBvbiBleHBvcnRzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLnIgPSAoZXhwb3J0cykgPT4ge1xuXHRpZih0eXBlb2YgU3ltYm9sICE9PSAndW5kZWZpbmVkJyAmJiBTeW1ib2wudG9TdHJpbmdUYWcpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgU3ltYm9sLnRvU3RyaW5nVGFnLCB7IHZhbHVlOiAnTW9kdWxlJyB9KTtcblx0fVxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xufTsiLCJpbXBvcnQgKiBhcyBuZWFybGV5IGZyb20gXCJuZWFybGV5XCI7XHJcbmltcG9ydCAqIGFzIGdyYW1tYXIgZnJvbSBcIi4vZ3JhbW1hclwiO1xyXG5cclxuY29uc3Qgc2NyZWVuRGltcyA9IGRvY3VtZW50LmJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbmNvbnN0IHNjcmVlbl93ID0gc2NyZWVuRGltcy53aWR0aDtcclxuY29uc3Qgc2NyZWVuX2ggPSBzY3JlZW5EaW1zLmhlaWdodDtcclxuY29uc3Qgc2NyZWVuRGltZW5zaW9uID0gW3NjcmVlbl93LCBzY3JlZW5faF07XHJcblxyXG5jb25zdCBtYWluQ2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21haW4tY2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbm1haW5DYW52YXMud2lkdGggPSBzY3JlZW5EaW1lbnNpb25bMF07XHJcbm1haW5DYW52YXMuaGVpZ2h0ID0gc2NyZWVuRGltZW5zaW9uWzFdO1xyXG5cclxuLy8gaGFuZGxlIHdpbmRvdyByZXNpemluZ1xyXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgKCkgPT4ge1xyXG4gICAgY29uc3Qgc2NyZWVuRGltcyA9IGRvY3VtZW50LmJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBzY3JlZW5fdyA9IHNjcmVlbkRpbXMud2lkdGg7XHJcbiAgICBjb25zdCBzY3JlZW5faCA9IHNjcmVlbkRpbXMuaGVpZ2h0O1xyXG4gICAgc2NyZWVuRGltZW5zaW9uWzBdID0gc2NyZWVuX3c7XHJcbiAgICBzY3JlZW5EaW1lbnNpb25bMV0gPSBzY3JlZW5faDtcclxuXHJcbiAgICBtYWluQ2FudmFzLndpZHRoID0gc2NyZWVuRGltZW5zaW9uWzBdO1xyXG4gICAgbWFpbkNhbnZhcy5oZWlnaHQgPSBzY3JlZW5EaW1lbnNpb25bMV07XHJcbn0pO1xyXG5cclxuLy8gaGFuZGxlIHNjcm9sbCB3aGVlbFxyXG5sZXQgbGluZWFyX3pvb20gPSAwLjU7XHJcbmxldCBsb2dfem9vbSA9IE1hdGguZXhwKGxpbmVhcl96b29tKTtcclxubWFpbkNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIChldikgPT4ge1xyXG4gICAgY29uc3QgZGlyZWN0aW9uID0gZXYuZGVsdGFZIC8gMTAwMDtcclxuICAgIGxpbmVhcl96b29tICs9IGRpcmVjdGlvbjtcclxuICAgIGxldCBwcmV2X2xvZ196b29tID0gbG9nX3pvb207XHJcbiAgICBsb2dfem9vbSA9IE1hdGguZXhwKGxpbmVhcl96b29tKVxyXG5cclxuICAgIHBvc2l0aW9uWzBdICs9IChldi5vZmZzZXRYIC0gKHNjcmVlbkRpbWVuc2lvblswXSAvIDIpKSAqIChsb2dfem9vbSAtIHByZXZfbG9nX3pvb20pXHJcbiAgICBwb3NpdGlvblsxXSArPSAoZXYub2Zmc2V0WSAtIChzY3JlZW5EaW1lbnNpb25bMV0gLyAyKSkgKiAobG9nX3pvb20gLSBwcmV2X2xvZ196b29tKVxyXG59KTtcclxuXHJcbi8vIGhhbmRsZSBtb3VzZSBkcmFnIGV2ZW50c1xyXG5sZXQgbW91c2VEb3duID0gZmFsc2U7XHJcbmxldCBwb3NpdGlvbiA9IFswLCAwXTtcclxubWFpbkNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCAoZXYpID0+IHtcclxuICAgIG1vdXNlRG93biA9IHRydWU7XHJcbn0pO1xyXG5tYWluQ2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIChldikgPT4ge1xyXG4gICAgaWYoIW1vdXNlRG93bikgcmV0dXJuO1xyXG5cclxuICAgIHBvc2l0aW9uWzBdICs9IGV2Lm1vdmVtZW50WCAqIGxvZ196b29tO1xyXG4gICAgcG9zaXRpb25bMV0gKz0gZXYubW92ZW1lbnRZICogbG9nX3pvb207XHJcbn0pO1xyXG5tYWluQ2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCAoZXYpID0+IHtcclxuICAgIG1vdXNlRG93biA9IGZhbHNlO1xyXG59KTtcclxubWFpbkNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKGV2KSA9PiB7XHJcbiAgICBtb3VzZURvd24gPSBmYWxzZTtcclxufSk7XHJcblxyXG5jb25zdCByZXNldFZpZXdCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlldy1idG4nKTtcclxuaWYocmVzZXRWaWV3QnRuKSByZXNldFZpZXdCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICBwb3NpdGlvbiA9IFswLCAwXTtcclxuICAgIGxpbmVhcl96b29tID0gMC41O1xyXG4gICAgbG9nX3pvb20gPSBNYXRoLmV4cChsaW5lYXJfem9vbSk7XHJcbn0pO1xyXG5jb25zdCByZXNldFRpbWVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndGltZS1idG4nKTtcclxuaWYocmVzZXRUaW1lQnRuKSByZXNldFRpbWVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICBmcmFtZUNvdW50ID0gMDtcclxufSk7XHJcblxyXG50eXBlIEdQVSA9IHtcclxuICAgIGFkYXB0ZXI6IEdQVUFkYXB0ZXIsXHJcbiAgICBkZXZpY2U6IEdQVURldmljZSxcclxuICAgIGNvbnRleHQ6IEdQVUNhbnZhc0NvbnRleHQsXHJcbiAgICBmb3JtYXQ6IEdQVVRleHR1cmVGb3JtYXRcclxufVxyXG5cclxuY29uc3QgaW5pdGlhbGl6ZSA9IGFzeW5jICgpIDogUHJvbWlzZTxHUFUgfCB1bmRlZmluZWQ+ID0+IHtcclxuICAgIGNvbnN0IGFkYXB0ZXIgPSBhd2FpdCBuYXZpZ2F0b3IuZ3B1LnJlcXVlc3RBZGFwdGVyKCk7XHJcbiAgICBpZighYWRhcHRlcikgcmV0dXJuO1xyXG4gICAgY29uc3QgZGV2aWNlID0gYXdhaXQgYWRhcHRlci5yZXF1ZXN0RGV2aWNlKCk7XHJcblxyXG4gICAgY29uc3QgY29udGV4dCA9IG1haW5DYW52YXMuZ2V0Q29udGV4dChcIndlYmdwdVwiKTtcclxuICAgIGlmKCFjb250ZXh0KSByZXR1cm47XHJcbiAgICBjb25zdCBmb3JtYXQgPSBuYXZpZ2F0b3IuZ3B1LmdldFByZWZlcnJlZENhbnZhc0Zvcm1hdCgpO1xyXG4gICAgY29udGV4dC5jb25maWd1cmUoeyBkZXZpY2UsIGZvcm1hdCB9KTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGFkYXB0ZXI6IGFkYXB0ZXIsXHJcbiAgICAgICAgZGV2aWNlOiBkZXZpY2UsXHJcbiAgICAgICAgY29udGV4dDogY29udGV4dCwgXHJcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcclxuICAgIH1cclxufVxyXG5cclxubGV0IGN1cnJlbnQgPSAwO1xyXG5sZXQgZnJhbWVDb3VudCA9IDA7XHJcbmNvbnN0IGNvbXBpbGUgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nLCBjb25maWc6IEdQVSwgaWQ6IG51bWJlcikgPT4ge1xyXG4gICAgY29uc29sZS5sb2coY29tbWFuZClcclxuICAgIC8vIGluaXRpYWxpemUgZ3B1XHJcbiAgICBjb25zdCB7XHJcbiAgICAgICAgYWRhcHRlcjogYWRhcHRlcixcclxuICAgICAgICBkZXZpY2U6IGRldmljZSxcclxuICAgICAgICBjb250ZXh0OiBjb250ZXh0LCBcclxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxyXG4gICAgfSA9IGNvbmZpZztcclxuXHJcbiAgICAvLyBpbml0IGJ1ZmZlcnMgdG8gcGFzcyB2YWx1ZXMgaW4gdmlhIHVuaWZvcm0gYnVmZmVycywgNHggZjMyc1xyXG4gICAgY29uc3QgaW9CdWZmZXJTaXplID0gNCAqIDQ7XHJcbiAgICBjb25zdCBpb0J1ZmZlciA9IGRldmljZS5jcmVhdGVCdWZmZXIoe1xyXG4gICAgICAgIHNpemU6IGlvQnVmZmVyU2l6ZSxcclxuICAgICAgICB1c2FnZTogR1BVQnVmZmVyVXNhZ2UuVU5JRk9STSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNUXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGlvQnVmZmVyMiA9IGRldmljZS5jcmVhdGVCdWZmZXIoe1xyXG4gICAgICAgIHNpemU6IGlvQnVmZmVyU2l6ZSxcclxuICAgICAgICB1c2FnZTogR1BVQnVmZmVyVXNhZ2UuVU5JRk9STSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNUXHJcbiAgICB9KTtcclxuXHJcbiAgICBsZXQgcmVzID0gYXdhaXQgZmV0Y2goJy4vcHJvZ3JhbS53Z3NsJylcclxuICAgIGxldCB0ZXh0ID0gYXdhaXQgcmVzLnRleHQoKTtcclxuICAgIGNvbnNvbGUubG9nKGNvbW1hbmQpXHJcbiAgICBsZXQgY29kZSA9IHRleHQucmVwbGFjZSgnW1tFWFBSXV0nLCBjb21tYW5kKTtcclxuICAgIGlmKGl0ZXJGbGFnKXtcclxuICAgICAgICBjb2RlICs9IGBcXG4ke2l0ZXJDb2RlfWA7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gY3JlYXRlIGdwdSByZW5kZXJpbmcgcGlwZWxpbmVcclxuICAgIGNvbnN0IHNoYWRlck1vZHVsZSA9IGRldmljZS5jcmVhdGVTaGFkZXJNb2R1bGUoeyBjb2RlIH0pO1xyXG4gICAgY29uc3QgcGlwZWxpbmUgPSBkZXZpY2UuY3JlYXRlUmVuZGVyUGlwZWxpbmUoe1xyXG4gICAgICAgIGxheW91dDogXCJhdXRvXCIsXHJcbiAgICAgICAgdmVydGV4OiB7XHJcbiAgICAgICAgICAgIG1vZHVsZTogc2hhZGVyTW9kdWxlLFxyXG4gICAgICAgICAgICBlbnRyeVBvaW50OiBcInZlcnRleE1haW5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZnJhZ21lbnQ6IHtcclxuICAgICAgICAgICAgbW9kdWxlOiBzaGFkZXJNb2R1bGUsXHJcbiAgICAgICAgICAgIGVudHJ5UG9pbnQ6IFwiZnJhZ21lbnRNYWluXCIsXHJcbiAgICAgICAgICAgIHRhcmdldHM6IFt7IGZvcm1hdCB9XSxcclxuICAgICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgdW5pZm9ybUJpbmRHcm91cCA9IGRldmljZS5jcmVhdGVCaW5kR3JvdXAoe1xyXG4gICAgICAgIGxheW91dDogcGlwZWxpbmUuZ2V0QmluZEdyb3VwTGF5b3V0KDApLFxyXG4gICAgICAgIGVudHJpZXM6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgYmluZGluZzogMCxcclxuICAgICAgICAgICAgICAgIHJlc291cmNlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnVmZmVyOiBpb0J1ZmZlclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBiaW5kaW5nOiAxLFxyXG4gICAgICAgICAgICAgICAgcmVzb3VyY2U6IHtcclxuICAgICAgICAgICAgICAgICAgICBidWZmZXI6IGlvQnVmZmVyMlxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgXVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gZnBzIGNhbGN1bGF0aW9uIHZhcmlhYmxlc1xyXG4gICAgY29uc3QgZnBzTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZnBzJyk7XHJcbiAgICBsZXQgcHJldlRpbWUgPSBuZXcgRGF0ZSgpO1xyXG4gICAgbGV0IHNlY29uZENvdW50ZXIgPSBuZXcgRGF0ZSgpO1xyXG4gICAgbGV0IGF2Z0ZwczogbnVtYmVyO1xyXG4gICAgZnJhbWVDb3VudCA9IDA7XHJcbiAgICBsZXQgYWxwaGEgPSAwLjk1O1xyXG5cclxuICAgIGNvbnN0IGZyYW1lID0gKCkgPT4ge1xyXG4gICAgICAgIC8vIHVwZGF0ZSB2YWx1ZXMgdG8gcGFzcyBpbiB2aWEgdW5pZm9ybSBidWZmZXJzXHJcbiAgICAgICAgZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKFxyXG4gICAgICAgICAgICBpb0J1ZmZlciwgMCxcclxuICAgICAgICAgICAgbmV3IEZsb2F0MzJBcnJheShbbG9nX3pvb20sIHBvc2l0aW9uWzBdLCBwb3NpdGlvblsxXSwgZnJhbWVDb3VudF0pXHJcbiAgICAgICAgKTtcclxuICAgICAgICBkZXZpY2UucXVldWUud3JpdGVCdWZmZXIoXHJcbiAgICAgICAgICAgIGlvQnVmZmVyMiwgMCxcclxuICAgICAgICAgICAgbmV3IEZsb2F0MzJBcnJheShbc2NyZWVuRGltZW5zaW9uWzBdLCBzY3JlZW5EaW1lbnNpb25bMV0sIDAsIDBdKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIGNyZWF0ZSBmdWxsIGRyYXcgY29tbWFuZCBmb3IgZ3B1XHJcbiAgICAgICAgY29uc3QgY29tbWFuZEVuY29kZXIgPSBkZXZpY2UuY3JlYXRlQ29tbWFuZEVuY29kZXIoKTtcclxuICAgICAgICBjb25zdCBjb2xvckF0dGFjaG1lbnRzIDogR1BVUmVuZGVyUGFzc0NvbG9yQXR0YWNobWVudFtdID0gW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB2aWV3OiBjb250ZXh0LmdldEN1cnJlbnRUZXh0dXJlKCkuY3JlYXRlVmlldygpLFxyXG4gICAgICAgICAgICAgICAgbG9hZE9wOiBcImNsZWFyXCIsXHJcbiAgICAgICAgICAgICAgICBzdG9yZU9wOiBcInN0b3JlXCIsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgXTtcclxuICAgICAgICBjb25zdCBwYXNzRW5jb2RlciA9IGNvbW1hbmRFbmNvZGVyLmJlZ2luUmVuZGVyUGFzcyh7Y29sb3JBdHRhY2htZW50c30pO1xyXG4gICAgICAgIHBhc3NFbmNvZGVyLnNldFBpcGVsaW5lKHBpcGVsaW5lKTtcclxuICAgICAgICBwYXNzRW5jb2Rlci5zZXRCaW5kR3JvdXAoMCwgdW5pZm9ybUJpbmRHcm91cCk7XHJcbiAgICAgICAgcGFzc0VuY29kZXIuZHJhdyg2KTtcclxuICAgICAgICBwYXNzRW5jb2Rlci5lbmQoKTtcclxuICAgICAgICBkZXZpY2UucXVldWUuc3VibWl0KFtjb21tYW5kRW5jb2Rlci5maW5pc2goKV0pO1xyXG5cclxuICAgICAgICAvLyBjYWxjdWxhdGUgYW5kIHVwZGF0ZSBmcHNcclxuICAgICAgICBjb25zdCBuZXdUaW1lID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBkdCA9IG5ld1RpbWUuZ2V0VGltZSgpIC0gcHJldlRpbWUuZ2V0VGltZSgpO1xyXG4gICAgICAgIGxldCBjdXJfZnBzID0gMTAwMCAvIGR0O1xyXG4gICAgICAgIGlmKCFhdmdGcHMpIGF2Z0ZwcyA9IGN1cl9mcHM7XHJcbiAgICAgICAgaWYoYXZnRnBzID09PSBJbmZpbml0eSkgYXZnRnBzID0gNjA7XHJcbiAgICAgICAgaWYoY3VyX2ZwcyA9PT0gSW5maW5pdHkpIGN1cl9mcHMgPSA2MDtcclxuICAgICAgICBhdmdGcHMgPSBhbHBoYSAqIGF2Z0ZwcyArICgxIC0gYWxwaGEpICogY3VyX2ZwcztcclxuICAgICAgICBpZihuZXdUaW1lLmdldFRpbWUoKSAtIHNlY29uZENvdW50ZXIuZ2V0VGltZSgpID4gNTAwKXtcclxuICAgICAgICAgICAgaWYoZnBzTGFiZWwpIGZwc0xhYmVsLmlubmVyVGV4dCA9IGBGUFM6ICR7TWF0aC5yb3VuZChhdmdGcHMpfWA7XHJcbiAgICAgICAgICAgIHNlY29uZENvdW50ZXIgPSBuZXdUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBwcmV2VGltZSA9IG5ld1RpbWU7XHJcbiAgICAgICAgZnJhbWVDb3VudCsrO1xyXG5cclxuICAgICAgICBpZihpZCA9PT0gY3VycmVudCkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZyYW1lKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnJhbWUoKTtcclxufVxyXG5cclxubGV0IGdwdUNvbmZpZzogR1BVO1xyXG5pbml0aWFsaXplKCkudGhlbigoY29uZmlnKSA9PiB7XHJcbiAgICBpZighY29uZmlnKSByZXR1cm47XHJcbiAgICBncHVDb25maWcgPSBjb25maWc7XHJcbiAgICBjb21waWxlKGRlZmF1bHRDb21tYW5kLCBjb25maWcsIDApO1xyXG59KTtcclxuXHJcbi8vIHNldCB1cCBpbnB1dCBjb21tYW5kIHBhcnNpbmdcclxuY29uc3QgZGVmYXVsdENvbW1hbmQgPSAnY19kaXYodmVjMmYoMS4wLCAwLjApLCB6KSc7XHJcbmxldCBpdGVyRmxhZyA9IGZhbHNlO1xyXG5sZXQgaXRlckNvZGUgPSBgYDtcclxuY29uc3QgcGFyc2VJbnB1dCA9IChzOiBzdHJpbmcpID0+IHtcclxuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBuZWFybGV5LlBhcnNlcihuZWFybGV5LkdyYW1tYXIuZnJvbUNvbXBpbGVkKGdyYW1tYXIpKTtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgcGFyc2VyLmZlZWQocyk7XHJcbiAgICB9IGNhdGNoKGUpe1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYocGFyc2VyLnJlc3VsdHMubGVuZ3RoID09PSAwKSByZXR1cm4gJyc7ICAgIFxyXG4gICAgbGV0IHJlc3VsdCA9IHBhcnNlci5yZXN1bHRzWzBdO1xyXG4gICAgbGV0IGVycm9yID0gZmFsc2U7XHJcbiAgICBpdGVyRmxhZyA9IGZhbHNlO1xyXG4gICAgaXRlckNvZGUgPSAnJztcclxuXHJcbiAgICBjb25zdCBleHBhbmQgPSAocmVzdWx0OiBhbnkpOiBzdHJpbmcgPT4ge1xyXG4gICAgICAgIGlmKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIGlmKHJlc3VsdCA9PT0gJ2UnKSByZXR1cm4gJ3ZlYzJmKDIuNzE4MjgxODI4NDU5MCwgMC4wKSc7XHJcbiAgICAgICAgICAgIGVsc2UgaWYocmVzdWx0ID09PSAncGknKSByZXR1cm4gJ3ZlYzJmKDMuMTQxNTkyNjUzNTg5NywgMC4wKSc7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYodHlwZW9mIHJlc3VsdCA9PT0gJ251bWJlcicpe1xyXG4gICAgICAgICAgICByZXR1cm4gYHZlYzJmKCR7cmVzdWx0fSwgMC4wKWA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICAgICAgaWYoIXJlc3VsdC50eXBlKXtcclxuICAgICAgICAgICAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYocmVzdWx0LnR5cGUgPT09ICdudW1iZXInKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBgdmVjMmYoJHtyZXN1bHQucmV9LCAke3Jlc3VsdC5pbX0pYDtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHJlc3VsdC50eXBlID09PSAnb3BlcmF0aW9uJyl7XHJcbiAgICAgICAgICAgICAgICBsZXQgb3AgPSByZXN1bHQub3A7XHJcbiAgICAgICAgICAgICAgICBsZXQgbGhzID0gZXhwYW5kKHJlc3VsdC5saHMpO1xyXG4gICAgICAgICAgICAgICAgbGV0IHJocyA9IGV4cGFuZChyZXN1bHQucmhzKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZihvcCA9PT0gJysnKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYGNfYWRkKCR7bGhzfSwke3Joc30pYFxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKG9wID09PSAnLScpe1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgY19zdWIoJHtsaHN9LCR7cmhzfSlgXHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYob3AgPT09ICcqJyl7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjX211bCgke2xoc30sJHtyaHN9KWBcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihvcCA9PT0gJy8nKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYGNfZGl2KCR7bGhzfSwke3Joc30pYFxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKG9wID09PSAnXicpe1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgY19wb3coJHtsaHN9LCR7cmhzfSlgXHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihyZXN1bHQudHlwZSA9PT0gJ2Z1bmN0aW9uJyl7XHJcbiAgICAgICAgICAgICAgICBsZXQgZnVuYyA9IHJlc3VsdC5mdW5jdGlvbjtcclxuICAgICAgICAgICAgICAgIGxldCBhcmdzID0gcmVzdWx0LmFyZ3MubWFwKChhcmc6IGFueSkgPT4gZXhwYW5kKGFyZykpOyBcclxuXHJcbiAgICAgICAgICAgICAgICBpZihmdW5jID09PSAnaXRlcicpe1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKGFyZ3MubGVuZ3RoICE9PSAyKSByZXR1cm4gJyc7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJDb2RlID0gYFxyXG4gICAgICAgICAgICAgICAgICAgIGZuIGNfaXRlcih6OiB2ZWMyZikgLT4gdmVjMmYge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdGltZTogZjMyID0gdW5pZm9ybXNbM10gLyAxMDAwLjA7IC8vIGluIHNlY29uZHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGR0OiBmMzIgPSB0aW1lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdCA9IHZlYzJmKGR0LCAwLjApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHpwID0gejtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yKHZhciBpID0gMC4wOyBpIDwgZjMyKCR7YXJnc1sxXX1bMF0pOyBpICs9IDEuMCl7IC8vIG51bWJlcnMgYXJlIGNvbnZlcnRlZCB0byBjb21wbGV4XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB6cCA9ICR7YXJnc1swXS5yZXBsYWNlKC96Jy9nLCAnenAnKX07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHpwO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBgO1xyXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJGbGFnID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjX2l0ZXIoeilgO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYGNfJHtmdW5jfSgke2FyZ3Muam9pbignLCcpfSlgO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZXJyb3IgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuICcnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGV4cGFuZGVkUmVzdWx0ID0gZXhwYW5kKHJlc3VsdCk7XHJcbiAgICBpZihleHBhbmRlZFJlc3VsdCA9PT0gJycpe1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgIH0gZWxzZSBpZihlcnJvcil7XHJcbiAgICAgICAgcmV0dXJuICcnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gZXhwYW5kZWRSZXN1bHQ7XHJcbiAgICB9XHJcbn1cclxuXHJcbiAgICAgICAgXHJcbi8qXHJcbkZhdnM6IFxyXG5pdGVyKCh6Kih0KzEpKV5pK3onXmkvKHQrMSksMTApIFxyXG4qL1xyXG5cclxubGV0IGZhbnRhc3lDb3VudGVyID0gMDtcclxubGV0IGlucHV0cyA9IFtcclxuICAgIFwiMS9pdGVyKHoreideKGkrc2luKHQpKSwxMCkrMVwiLFxyXG4gICAgXCJpdGVyKHpeKGkqMC41KStzcXJ0KHonKih0KzEpKmkqKC0xKSksOClcIixcclxuICAgIFwiYXRhbihpK3oqKHQrMC4yKSlcIixcclxuICAgIFwieitzaW4oeippKnQpK2Nvcyh6KmkqdCoyKVwiLFxyXG4gICAgXCJpdGVyKHoqc3FydCgodCswLjUpKmkpK3onXihzcXJ0KDEvdCtpKSksMTApXCIsXHJcbiAgICBcIml0ZXIoeipzaW4odCppKSt6J15pLDEwKVwiLFxyXG4gICAgXCJ6K3Npbih6KmkqdCleKGkqdCoyKVwiLFxyXG4gICAgXCJzaW4oaSp6LXpeKDIqdCkpK3RhbigxL3otel4yKVwiLFxyXG4gICAgXCJzcXJ0KHotel4oMip0KSkrMS96LXpeMlwiLFxyXG4gICAgXCIxL2l0ZXIoeit6J14odCksOCkrMVwiLFxyXG4gICAgXCJ0L2l0ZXIoeit6J14oaSt0YW4odCkpLDQpKzFcIlxyXG5dO1xyXG5jb25zdCBwdXNoTWVCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHVzaC1tZS1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcclxucHVzaE1lQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgbmV4dCgpO1xyXG59KTtcclxuXHJcbmNvbnN0IG5leHQgPSAoKSA9PiB7XHJcbiAgICBmYW50YXN5Q291bnRlciArPSAxO1xyXG4gICAgZmFudGFzeUNvdW50ZXIgJT0gaW5wdXRzLmxlbmd0aDtcclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBwYXJzZUlucHV0KGlucHV0c1tmYW50YXN5Q291bnRlcl0pO1xyXG4gICAgY3VycmVudCArPSAxO1xyXG4gICAgaWYocmVzdWx0ICE9PSAnJykgY29tcGlsZShyZXN1bHQsIGdwdUNvbmZpZywgY3VycmVudCk7XHJcbiAgICBjb25zb2xlLmxvZyhcIlJFU0VUXCIpXHJcbn1cclxuc2V0SW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgbmV4dCgpO1xyXG59LCAxMDAwMClcclxuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICBuZXh0KCk7XHJcbn0sIDEwMDApOyJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==