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
const screenDimension = [screen_w * 0.75, screen_h];
const mainCanvas = document.getElementById('main-canvas');
mainCanvas.width = screenDimension[0];
mainCanvas.height = screenDimension[1];
// handle window resizing
window.addEventListener('resize', () => {
    const screenDims = document.body.getBoundingClientRect();
    const screen_w = screenDims.width;
    const screen_h = screenDims.height;
    screenDimension[0] = screen_w * 0.75;
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
    let res = yield fetch('/src/program.wgsl');
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
const functionInput = document.getElementById('function-input');
functionInput.value = '1/z';
if (functionInput) {
    functionInput.addEventListener('input', () => {
        const rawInput = functionInput.value;
        const result = parseInput(rawInput);
        current += 1;
        if (result !== '')
            compile(result, gpuConfig, current);
    });
}
/*
Favs:
iter((z*(t+1))^i+z'^i/(t+1),10)

*/ 

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxVQUFVO0FBQ1Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7O0FBRWI7QUFDQTtBQUNBO0FBQ0EsVUFBVTtBQUNWO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsdUJBQXVCO0FBQy9DO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsY0FBYztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1QsK0NB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QUMsQ0FBQztRQUNiLElBQUcsTUFBTSxLQUFLLEVBQUU7WUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztDQUNOO0FBRUQ7Ozs7RUFJRSIsInNvdXJjZXMiOlsid2VicGFjazovL2NvbmZvcm1hbC1tYXAtd2ViZ3B1Ly4vbm9kZV9tb2R1bGVzL25lYXJsZXkvbGliL25lYXJsZXkuanMiLCJ3ZWJwYWNrOi8vY29uZm9ybWFsLW1hcC13ZWJncHUvLi9zcmMvZ3JhbW1hci5qcyIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL3J1bnRpbWUvY29tcGF0IGdldCBkZWZhdWx0IGV4cG9ydCIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL3J1bnRpbWUvZGVmaW5lIHByb3BlcnR5IGdldHRlcnMiLCJ3ZWJwYWNrOi8vY29uZm9ybWFsLW1hcC13ZWJncHUvd2VicGFjay9ydW50aW1lL2hhc093blByb3BlcnR5IHNob3J0aGFuZCIsIndlYnBhY2s6Ly9jb25mb3JtYWwtbWFwLXdlYmdwdS93ZWJwYWNrL3J1bnRpbWUvbWFrZSBuYW1lc3BhY2Ugb2JqZWN0Iiwid2VicGFjazovL2NvbmZvcm1hbC1tYXAtd2ViZ3B1Ly4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbihyb290LCBmYWN0b3J5KSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJvb3QubmVhcmxleSA9IGZhY3RvcnkoKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uKCkge1xuXG4gICAgZnVuY3Rpb24gUnVsZShuYW1lLCBzeW1ib2xzLCBwb3N0cHJvY2Vzcykge1xuICAgICAgICB0aGlzLmlkID0gKytSdWxlLmhpZ2hlc3RJZDtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAgICAgdGhpcy5zeW1ib2xzID0gc3ltYm9sczsgICAgICAgIC8vIGEgbGlzdCBvZiBsaXRlcmFsIHwgcmVnZXggY2xhc3MgfCBub250ZXJtaW5hbFxuICAgICAgICB0aGlzLnBvc3Rwcm9jZXNzID0gcG9zdHByb2Nlc3M7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBSdWxlLmhpZ2hlc3RJZCA9IDA7XG5cbiAgICBSdWxlLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKHdpdGhDdXJzb3JBdCkge1xuICAgICAgICB2YXIgc3ltYm9sU2VxdWVuY2UgPSAodHlwZW9mIHdpdGhDdXJzb3JBdCA9PT0gXCJ1bmRlZmluZWRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyB0aGlzLnN5bWJvbHMubWFwKGdldFN5bWJvbFNob3J0RGlzcGxheSkuam9pbignICcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogKCAgIHRoaXMuc3ltYm9scy5zbGljZSgwLCB3aXRoQ3Vyc29yQXQpLm1hcChnZXRTeW1ib2xTaG9ydERpc3BsYXkpLmpvaW4oJyAnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBcIiDil48gXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgdGhpcy5zeW1ib2xzLnNsaWNlKHdpdGhDdXJzb3JBdCkubWFwKGdldFN5bWJvbFNob3J0RGlzcGxheSkuam9pbignICcpICAgICApO1xuICAgICAgICByZXR1cm4gdGhpcy5uYW1lICsgXCIg4oaSIFwiICsgc3ltYm9sU2VxdWVuY2U7XG4gICAgfVxuXG5cbiAgICAvLyBhIFN0YXRlIGlzIGEgcnVsZSBhdCBhIHBvc2l0aW9uIGZyb20gYSBnaXZlbiBzdGFydGluZyBwb2ludCBpbiB0aGUgaW5wdXQgc3RyZWFtIChyZWZlcmVuY2UpXG4gICAgZnVuY3Rpb24gU3RhdGUocnVsZSwgZG90LCByZWZlcmVuY2UsIHdhbnRlZEJ5KSB7XG4gICAgICAgIHRoaXMucnVsZSA9IHJ1bGU7XG4gICAgICAgIHRoaXMuZG90ID0gZG90O1xuICAgICAgICB0aGlzLnJlZmVyZW5jZSA9IHJlZmVyZW5jZTtcbiAgICAgICAgdGhpcy5kYXRhID0gW107XG4gICAgICAgIHRoaXMud2FudGVkQnkgPSB3YW50ZWRCeTtcbiAgICAgICAgdGhpcy5pc0NvbXBsZXRlID0gdGhpcy5kb3QgPT09IHJ1bGUuc3ltYm9scy5sZW5ndGg7XG4gICAgfVxuXG4gICAgU3RhdGUucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBcIntcIiArIHRoaXMucnVsZS50b1N0cmluZyh0aGlzLmRvdCkgKyBcIn0sIGZyb206IFwiICsgKHRoaXMucmVmZXJlbmNlIHx8IDApO1xuICAgIH07XG5cbiAgICBTdGF0ZS5wcm90b3R5cGUubmV4dFN0YXRlID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgdmFyIHN0YXRlID0gbmV3IFN0YXRlKHRoaXMucnVsZSwgdGhpcy5kb3QgKyAxLCB0aGlzLnJlZmVyZW5jZSwgdGhpcy53YW50ZWRCeSk7XG4gICAgICAgIHN0YXRlLmxlZnQgPSB0aGlzO1xuICAgICAgICBzdGF0ZS5yaWdodCA9IGNoaWxkO1xuICAgICAgICBpZiAoc3RhdGUuaXNDb21wbGV0ZSkge1xuICAgICAgICAgICAgc3RhdGUuZGF0YSA9IHN0YXRlLmJ1aWxkKCk7XG4gICAgICAgICAgICAvLyBIYXZpbmcgcmlnaHQgc2V0IGhlcmUgd2lsbCBwcmV2ZW50IHRoZSByaWdodCBzdGF0ZSBhbmQgaXRzIGNoaWxkcmVuXG4gICAgICAgICAgICAvLyBmb3JtIGJlaW5nIGdhcmJhZ2UgY29sbGVjdGVkXG4gICAgICAgICAgICBzdGF0ZS5yaWdodCA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgfTtcblxuICAgIFN0YXRlLnByb3RvdHlwZS5idWlsZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY2hpbGRyZW4gPSBbXTtcbiAgICAgICAgdmFyIG5vZGUgPSB0aGlzO1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKG5vZGUucmlnaHQuZGF0YSk7XG4gICAgICAgICAgICBub2RlID0gbm9kZS5sZWZ0O1xuICAgICAgICB9IHdoaWxlIChub2RlLmxlZnQpO1xuICAgICAgICBjaGlsZHJlbi5yZXZlcnNlKCk7XG4gICAgICAgIHJldHVybiBjaGlsZHJlbjtcbiAgICB9O1xuXG4gICAgU3RhdGUucHJvdG90eXBlLmZpbmlzaCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5ydWxlLnBvc3Rwcm9jZXNzKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSB0aGlzLnJ1bGUucG9zdHByb2Nlc3ModGhpcy5kYXRhLCB0aGlzLnJlZmVyZW5jZSwgUGFyc2VyLmZhaWwpO1xuICAgICAgICB9XG4gICAgfTtcblxuXG4gICAgZnVuY3Rpb24gQ29sdW1uKGdyYW1tYXIsIGluZGV4KSB7XG4gICAgICAgIHRoaXMuZ3JhbW1hciA9IGdyYW1tYXI7XG4gICAgICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICAgICAgdGhpcy5zdGF0ZXMgPSBbXTtcbiAgICAgICAgdGhpcy53YW50cyA9IHt9OyAvLyBzdGF0ZXMgaW5kZXhlZCBieSB0aGUgbm9uLXRlcm1pbmFsIHRoZXkgZXhwZWN0XG4gICAgICAgIHRoaXMuc2Nhbm5hYmxlID0gW107IC8vIGxpc3Qgb2Ygc3RhdGVzIHRoYXQgZXhwZWN0IGEgdG9rZW5cbiAgICAgICAgdGhpcy5jb21wbGV0ZWQgPSB7fTsgLy8gc3RhdGVzIHRoYXQgYXJlIG51bGxhYmxlXG4gICAgfVxuXG5cbiAgICBDb2x1bW4ucHJvdG90eXBlLnByb2Nlc3MgPSBmdW5jdGlvbihuZXh0Q29sdW1uKSB7XG4gICAgICAgIHZhciBzdGF0ZXMgPSB0aGlzLnN0YXRlcztcbiAgICAgICAgdmFyIHdhbnRzID0gdGhpcy53YW50cztcbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IHRoaXMuY29tcGxldGVkO1xuXG4gICAgICAgIGZvciAodmFyIHcgPSAwOyB3IDwgc3RhdGVzLmxlbmd0aDsgdysrKSB7IC8vIG5iLiB3ZSBwdXNoKCkgZHVyaW5nIGl0ZXJhdGlvblxuICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RhdGVzW3ddO1xuXG4gICAgICAgICAgICBpZiAoc3RhdGUuaXNDb21wbGV0ZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLmZpbmlzaCgpO1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5kYXRhICE9PSBQYXJzZXIuZmFpbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBjb21wbGV0ZVxuICAgICAgICAgICAgICAgICAgICB2YXIgd2FudGVkQnkgPSBzdGF0ZS53YW50ZWRCeTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IHdhbnRlZEJ5Lmxlbmd0aDsgaS0tOyApIHsgLy8gdGhpcyBsaW5lIGlzIGhvdFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxlZnQgPSB3YW50ZWRCeVtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29tcGxldGUobGVmdCwgc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc3BlY2lhbC1jYXNlIG51bGxhYmxlc1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUucmVmZXJlbmNlID09PSB0aGlzLmluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIHN1cmUgZnV0dXJlIHByZWRpY3RvcnMgb2YgdGhpcyBydWxlIGdldCBjb21wbGV0ZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZXhwID0gc3RhdGUucnVsZS5uYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMuY29tcGxldGVkW2V4cF0gPSB0aGlzLmNvbXBsZXRlZFtleHBdIHx8IFtdKS5wdXNoKHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBxdWV1ZSBzY2FubmFibGUgc3RhdGVzXG4gICAgICAgICAgICAgICAgdmFyIGV4cCA9IHN0YXRlLnJ1bGUuc3ltYm9sc1tzdGF0ZS5kb3RdO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZXhwICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjYW5uYWJsZS5wdXNoKHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gcHJlZGljdFxuICAgICAgICAgICAgICAgIGlmICh3YW50c1tleHBdKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhbnRzW2V4cF0ucHVzaChzdGF0ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZC5oYXNPd25Qcm9wZXJ0eShleHApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbnVsbHMgPSBjb21wbGV0ZWRbZXhwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVsbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmlnaHQgPSBudWxsc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbXBsZXRlKHN0YXRlLCByaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB3YW50c1tleHBdID0gW3N0YXRlXTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmVkaWN0KGV4cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgQ29sdW1uLnByb3RvdHlwZS5wcmVkaWN0ID0gZnVuY3Rpb24oZXhwKSB7XG4gICAgICAgIHZhciBydWxlcyA9IHRoaXMuZ3JhbW1hci5ieU5hbWVbZXhwXSB8fCBbXTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJ1bGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgciA9IHJ1bGVzW2ldO1xuICAgICAgICAgICAgdmFyIHdhbnRlZEJ5ID0gdGhpcy53YW50c1tleHBdO1xuICAgICAgICAgICAgdmFyIHMgPSBuZXcgU3RhdGUociwgMCwgdGhpcy5pbmRleCwgd2FudGVkQnkpO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZXMucHVzaChzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIENvbHVtbi5wcm90b3R5cGUuY29tcGxldGUgPSBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICB2YXIgY29weSA9IGxlZnQubmV4dFN0YXRlKHJpZ2h0KTtcbiAgICAgICAgdGhpcy5zdGF0ZXMucHVzaChjb3B5KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIEdyYW1tYXIocnVsZXMsIHN0YXJ0KSB7XG4gICAgICAgIHRoaXMucnVsZXMgPSBydWxlcztcbiAgICAgICAgdGhpcy5zdGFydCA9IHN0YXJ0IHx8IHRoaXMucnVsZXNbMF0ubmFtZTtcbiAgICAgICAgdmFyIGJ5TmFtZSA9IHRoaXMuYnlOYW1lID0ge307XG4gICAgICAgIHRoaXMucnVsZXMuZm9yRWFjaChmdW5jdGlvbihydWxlKSB7XG4gICAgICAgICAgICBpZiAoIWJ5TmFtZS5oYXNPd25Qcm9wZXJ0eShydWxlLm5hbWUpKSB7XG4gICAgICAgICAgICAgICAgYnlOYW1lW3J1bGUubmFtZV0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJ5TmFtZVtydWxlLm5hbWVdLnB1c2gocnVsZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvIHdlIGNhbiBhbGxvdyBwYXNzaW5nIChydWxlcywgc3RhcnQpIGRpcmVjdGx5IHRvIFBhcnNlciBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgICBHcmFtbWFyLmZyb21Db21waWxlZCA9IGZ1bmN0aW9uKHJ1bGVzLCBzdGFydCkge1xuICAgICAgICB2YXIgbGV4ZXIgPSBydWxlcy5MZXhlcjtcbiAgICAgICAgaWYgKHJ1bGVzLlBhcnNlclN0YXJ0KSB7XG4gICAgICAgICAgc3RhcnQgPSBydWxlcy5QYXJzZXJTdGFydDtcbiAgICAgICAgICBydWxlcyA9IHJ1bGVzLlBhcnNlclJ1bGVzO1xuICAgICAgICB9XG4gICAgICAgIHZhciBydWxlcyA9IHJ1bGVzLm1hcChmdW5jdGlvbiAocikgeyByZXR1cm4gKG5ldyBSdWxlKHIubmFtZSwgci5zeW1ib2xzLCByLnBvc3Rwcm9jZXNzKSk7IH0pO1xuICAgICAgICB2YXIgZyA9IG5ldyBHcmFtbWFyKHJ1bGVzLCBzdGFydCk7XG4gICAgICAgIGcubGV4ZXIgPSBsZXhlcjsgLy8gbmIuIHN0b3JpbmcgbGV4ZXIgb24gR3JhbW1hciBpcyBpZmZ5LCBidXQgdW5hdm9pZGFibGVcbiAgICAgICAgcmV0dXJuIGc7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBTdHJlYW1MZXhlcigpIHtcbiAgICAgIHRoaXMucmVzZXQoXCJcIik7XG4gICAgfVxuXG4gICAgU3RyZWFtTGV4ZXIucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24oZGF0YSwgc3RhdGUpIHtcbiAgICAgICAgdGhpcy5idWZmZXIgPSBkYXRhO1xuICAgICAgICB0aGlzLmluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5saW5lID0gc3RhdGUgPyBzdGF0ZS5saW5lIDogMTtcbiAgICAgICAgdGhpcy5sYXN0TGluZUJyZWFrID0gc3RhdGUgPyAtc3RhdGUuY29sIDogMDtcbiAgICB9XG5cbiAgICBTdHJlYW1MZXhlci5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5pbmRleCA8IHRoaXMuYnVmZmVyLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGNoID0gdGhpcy5idWZmZXJbdGhpcy5pbmRleCsrXTtcbiAgICAgICAgICAgIGlmIChjaCA9PT0gJ1xcbicpIHtcbiAgICAgICAgICAgICAgdGhpcy5saW5lICs9IDE7XG4gICAgICAgICAgICAgIHRoaXMubGFzdExpbmVCcmVhayA9IHRoaXMuaW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge3ZhbHVlOiBjaH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBTdHJlYW1MZXhlci5wcm90b3R5cGUuc2F2ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICBjb2w6IHRoaXMuaW5kZXggLSB0aGlzLmxhc3RMaW5lQnJlYWssXG4gICAgICB9XG4gICAgfVxuXG4gICAgU3RyZWFtTGV4ZXIucHJvdG90eXBlLmZvcm1hdEVycm9yID0gZnVuY3Rpb24odG9rZW4sIG1lc3NhZ2UpIHtcbiAgICAgICAgLy8gbmIuIHRoaXMgZ2V0cyBjYWxsZWQgYWZ0ZXIgY29uc3VtaW5nIHRoZSBvZmZlbmRpbmcgdG9rZW4sXG4gICAgICAgIC8vIHNvIHRoZSBjdWxwcml0IGlzIGluZGV4LTFcbiAgICAgICAgdmFyIGJ1ZmZlciA9IHRoaXMuYnVmZmVyO1xuICAgICAgICBpZiAodHlwZW9mIGJ1ZmZlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHZhciBsaW5lcyA9IGJ1ZmZlclxuICAgICAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxuICAgICAgICAgICAgICAgIC5zbGljZShcbiAgICAgICAgICAgICAgICAgICAgTWF0aC5tYXgoMCwgdGhpcy5saW5lIC0gNSksIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB2YXIgbmV4dExpbmVCcmVhayA9IGJ1ZmZlci5pbmRleE9mKCdcXG4nLCB0aGlzLmluZGV4KTtcbiAgICAgICAgICAgIGlmIChuZXh0TGluZUJyZWFrID09PSAtMSkgbmV4dExpbmVCcmVhayA9IGJ1ZmZlci5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgY29sID0gdGhpcy5pbmRleCAtIHRoaXMubGFzdExpbmVCcmVhaztcbiAgICAgICAgICAgIHZhciBsYXN0TGluZURpZ2l0cyA9IFN0cmluZyh0aGlzLmxpbmUpLmxlbmd0aDtcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gXCIgYXQgbGluZSBcIiArIHRoaXMubGluZSArIFwiIGNvbCBcIiArIGNvbCArIFwiOlxcblxcblwiO1xuICAgICAgICAgICAgbWVzc2FnZSArPSBsaW5lc1xuICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24obGluZSwgaSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGFkKHRoaXMubGluZSAtIGxpbmVzLmxlbmd0aCArIGkgKyAxLCBsYXN0TGluZURpZ2l0cykgKyBcIiBcIiArIGxpbmU7XG4gICAgICAgICAgICAgICAgfSwgdGhpcylcbiAgICAgICAgICAgICAgICAuam9pbihcIlxcblwiKTtcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gXCJcXG5cIiArIHBhZChcIlwiLCBsYXN0TGluZURpZ2l0cyArIGNvbCkgKyBcIl5cXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBtZXNzYWdlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG1lc3NhZ2UgKyBcIiBhdCBpbmRleCBcIiArICh0aGlzLmluZGV4IC0gMSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwYWQobiwgbGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgcyA9IFN0cmluZyhuKTtcbiAgICAgICAgICAgIHJldHVybiBBcnJheShsZW5ndGggLSBzLmxlbmd0aCArIDEpLmpvaW4oXCIgXCIpICsgcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIFBhcnNlcihydWxlcywgc3RhcnQsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKHJ1bGVzIGluc3RhbmNlb2YgR3JhbW1hcikge1xuICAgICAgICAgICAgdmFyIGdyYW1tYXIgPSBydWxlcztcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gc3RhcnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZ3JhbW1hciA9IEdyYW1tYXIuZnJvbUNvbXBpbGVkKHJ1bGVzLCBzdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ncmFtbWFyID0gZ3JhbW1hcjtcblxuICAgICAgICAvLyBSZWFkIG9wdGlvbnNcbiAgICAgICAgdGhpcy5vcHRpb25zID0ge1xuICAgICAgICAgICAga2VlcEhpc3Rvcnk6IGZhbHNlLFxuICAgICAgICAgICAgbGV4ZXI6IGdyYW1tYXIubGV4ZXIgfHwgbmV3IFN0cmVhbUxleGVyLFxuICAgICAgICB9O1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gKG9wdGlvbnMgfHwge30pKSB7XG4gICAgICAgICAgICB0aGlzLm9wdGlvbnNba2V5XSA9IG9wdGlvbnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldHVwIGxleGVyXG4gICAgICAgIHRoaXMubGV4ZXIgPSB0aGlzLm9wdGlvbnMubGV4ZXI7XG4gICAgICAgIHRoaXMubGV4ZXJTdGF0ZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBTZXR1cCBhIHRhYmxlXG4gICAgICAgIHZhciBjb2x1bW4gPSBuZXcgQ29sdW1uKGdyYW1tYXIsIDApO1xuICAgICAgICB2YXIgdGFibGUgPSB0aGlzLnRhYmxlID0gW2NvbHVtbl07XG5cbiAgICAgICAgLy8gSSBjb3VsZCBiZSBleHBlY3RpbmcgYW55dGhpbmcuXG4gICAgICAgIGNvbHVtbi53YW50c1tncmFtbWFyLnN0YXJ0XSA9IFtdO1xuICAgICAgICBjb2x1bW4ucHJlZGljdChncmFtbWFyLnN0YXJ0KTtcbiAgICAgICAgLy8gVE9ETyB3aGF0IGlmIHN0YXJ0IHJ1bGUgaXMgbnVsbGFibGU/XG4gICAgICAgIGNvbHVtbi5wcm9jZXNzKCk7XG4gICAgICAgIHRoaXMuY3VycmVudCA9IDA7IC8vIHRva2VuIGluZGV4XG4gICAgfVxuXG4gICAgLy8gY3JlYXRlIGEgcmVzZXJ2ZWQgdG9rZW4gZm9yIGluZGljYXRpbmcgYSBwYXJzZSBmYWlsXG4gICAgUGFyc2VyLmZhaWwgPSB7fTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUuZmVlZCA9IGZ1bmN0aW9uKGNodW5rKSB7XG4gICAgICAgIHZhciBsZXhlciA9IHRoaXMubGV4ZXI7XG4gICAgICAgIGxleGVyLnJlc2V0KGNodW5rLCB0aGlzLmxleGVyU3RhdGUpO1xuXG4gICAgICAgIHZhciB0b2tlbjtcbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBsZXhlci5uZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSBuZXh0IGNvbHVtbiBzbyB0aGF0IHRoZSBlcnJvciByZXBvcnRlclxuICAgICAgICAgICAgICAgIC8vIGNhbiBkaXNwbGF5IHRoZSBjb3JyZWN0bHkgcHJlZGljdGVkIHN0YXRlcy5cbiAgICAgICAgICAgICAgICB2YXIgbmV4dENvbHVtbiA9IG5ldyBDb2x1bW4odGhpcy5ncmFtbWFyLCB0aGlzLmN1cnJlbnQgKyAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlLnB1c2gobmV4dENvbHVtbik7XG4gICAgICAgICAgICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcih0aGlzLnJlcG9ydExleGVyRXJyb3IoZSkpO1xuICAgICAgICAgICAgICAgIGVyci5vZmZzZXQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgICAgICAgICAgICAgZXJyLnRva2VuID0gZS50b2tlbjtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBXZSBhZGQgbmV3IHN0YXRlcyB0byB0YWJsZVtjdXJyZW50KzFdXG4gICAgICAgICAgICB2YXIgY29sdW1uID0gdGhpcy50YWJsZVt0aGlzLmN1cnJlbnRdO1xuXG4gICAgICAgICAgICAvLyBHQyB1bnVzZWQgc3RhdGVzXG4gICAgICAgICAgICBpZiAoIXRoaXMub3B0aW9ucy5rZWVwSGlzdG9yeSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnRhYmxlW3RoaXMuY3VycmVudCAtIDFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuY3VycmVudCArIDE7XG4gICAgICAgICAgICB2YXIgbmV4dENvbHVtbiA9IG5ldyBDb2x1bW4odGhpcy5ncmFtbWFyLCBuKTtcbiAgICAgICAgICAgIHRoaXMudGFibGUucHVzaChuZXh0Q29sdW1uKTtcblxuICAgICAgICAgICAgLy8gQWR2YW5jZSBhbGwgdG9rZW5zIHRoYXQgZXhwZWN0IHRoZSBzeW1ib2xcbiAgICAgICAgICAgIHZhciBsaXRlcmFsID0gdG9rZW4udGV4dCAhPT0gdW5kZWZpbmVkID8gdG9rZW4udGV4dCA6IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gbGV4ZXIuY29uc3RydWN0b3IgPT09IFN0cmVhbUxleGVyID8gdG9rZW4udmFsdWUgOiB0b2tlbjtcbiAgICAgICAgICAgIHZhciBzY2FubmFibGUgPSBjb2x1bW4uc2Nhbm5hYmxlO1xuICAgICAgICAgICAgZm9yICh2YXIgdyA9IHNjYW5uYWJsZS5sZW5ndGg7IHctLTsgKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc2Nhbm5hYmxlW3ddO1xuICAgICAgICAgICAgICAgIHZhciBleHBlY3QgPSBzdGF0ZS5ydWxlLnN5bWJvbHNbc3RhdGUuZG90XTtcbiAgICAgICAgICAgICAgICAvLyBUcnkgdG8gY29uc3VtZSB0aGUgdG9rZW5cbiAgICAgICAgICAgICAgICAvLyBlaXRoZXIgcmVnZXggb3IgbGl0ZXJhbFxuICAgICAgICAgICAgICAgIGlmIChleHBlY3QudGVzdCA/IGV4cGVjdC50ZXN0KHZhbHVlKSA6XG4gICAgICAgICAgICAgICAgICAgIGV4cGVjdC50eXBlID8gZXhwZWN0LnR5cGUgPT09IHRva2VuLnR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBleHBlY3QubGl0ZXJhbCA9PT0gbGl0ZXJhbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgaXRcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHQgPSBzdGF0ZS5uZXh0U3RhdGUoe2RhdGE6IHZhbHVlLCB0b2tlbjogdG9rZW4sIGlzVG9rZW46IHRydWUsIHJlZmVyZW5jZTogbiAtIDF9KTtcbiAgICAgICAgICAgICAgICAgICAgbmV4dENvbHVtbi5zdGF0ZXMucHVzaChuZXh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5leHQsIGZvciBlYWNoIG9mIHRoZSBydWxlcywgd2UgZWl0aGVyXG4gICAgICAgICAgICAvLyAoYSkgY29tcGxldGUgaXQsIGFuZCB0cnkgdG8gc2VlIGlmIHRoZSByZWZlcmVuY2Ugcm93IGV4cGVjdGVkIHRoYXRcbiAgICAgICAgICAgIC8vICAgICBydWxlXG4gICAgICAgICAgICAvLyAoYikgcHJlZGljdCB0aGUgbmV4dCBub250ZXJtaW5hbCBpdCBleHBlY3RzIGJ5IGFkZGluZyB0aGF0XG4gICAgICAgICAgICAvLyAgICAgbm9udGVybWluYWwncyBzdGFydCBzdGF0ZVxuICAgICAgICAgICAgLy8gVG8gcHJldmVudCBkdXBsaWNhdGlvbiwgd2UgYWxzbyBrZWVwIHRyYWNrIG9mIHJ1bGVzIHdlIGhhdmUgYWxyZWFkeVxuICAgICAgICAgICAgLy8gYWRkZWRcblxuICAgICAgICAgICAgbmV4dENvbHVtbi5wcm9jZXNzKCk7XG5cbiAgICAgICAgICAgIC8vIElmIG5lZWRlZCwgdGhyb3cgYW4gZXJyb3I6XG4gICAgICAgICAgICBpZiAobmV4dENvbHVtbi5zdGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgLy8gTm8gc3RhdGVzIGF0IGFsbCEgVGhpcyBpcyBub3QgZ29vZC5cbiAgICAgICAgICAgICAgICB2YXIgZXJyID0gbmV3IEVycm9yKHRoaXMucmVwb3J0RXJyb3IodG9rZW4pKTtcbiAgICAgICAgICAgICAgICBlcnIub2Zmc2V0ID0gdGhpcy5jdXJyZW50O1xuICAgICAgICAgICAgICAgIGVyci50b2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbWF5YmUgc2F2ZSBsZXhlciBzdGF0ZVxuICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5rZWVwSGlzdG9yeSkge1xuICAgICAgICAgICAgICBjb2x1bW4ubGV4ZXJTdGF0ZSA9IGxleGVyLnNhdmUoKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnQrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sdW1uKSB7XG4gICAgICAgICAgdGhpcy5sZXhlclN0YXRlID0gbGV4ZXIuc2F2ZSgpXG4gICAgICAgIH1cblxuICAgICAgICAvLyBJbmNyZW1lbnRhbGx5IGtlZXAgdHJhY2sgb2YgcmVzdWx0c1xuICAgICAgICB0aGlzLnJlc3VsdHMgPSB0aGlzLmZpbmlzaCgpO1xuXG4gICAgICAgIC8vIEFsbG93IGNoYWluaW5nLCBmb3Igd2hhdGV2ZXIgaXQncyB3b3J0aFxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5yZXBvcnRMZXhlckVycm9yID0gZnVuY3Rpb24obGV4ZXJFcnJvcikge1xuICAgICAgICB2YXIgdG9rZW5EaXNwbGF5LCBsZXhlck1lc3NhZ2U7XG4gICAgICAgIC8vIFBsYW5uaW5nIHRvIGFkZCBhIHRva2VuIHByb3BlcnR5IHRvIG1vbydzIHRocm93biBlcnJvclxuICAgICAgICAvLyBldmVuIG9uIGVycm9yaW5nIHRva2VucyB0byBiZSB1c2VkIGluIGVycm9yIGRpc3BsYXkgYmVsb3dcbiAgICAgICAgdmFyIHRva2VuID0gbGV4ZXJFcnJvci50b2tlbjtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICB0b2tlbkRpc3BsYXkgPSBcImlucHV0IFwiICsgSlNPTi5zdHJpbmdpZnkodG9rZW4udGV4dFswXSkgKyBcIiAobGV4ZXIgZXJyb3IpXCI7XG4gICAgICAgICAgICBsZXhlck1lc3NhZ2UgPSB0aGlzLmxleGVyLmZvcm1hdEVycm9yKHRva2VuLCBcIlN5bnRheCBlcnJvclwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRva2VuRGlzcGxheSA9IFwiaW5wdXQgKGxleGVyIGVycm9yKVwiO1xuICAgICAgICAgICAgbGV4ZXJNZXNzYWdlID0gbGV4ZXJFcnJvci5tZXNzYWdlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnJlcG9ydEVycm9yQ29tbW9uKGxleGVyTWVzc2FnZSwgdG9rZW5EaXNwbGF5KTtcbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5yZXBvcnRFcnJvciA9IGZ1bmN0aW9uKHRva2VuKSB7XG4gICAgICAgIHZhciB0b2tlbkRpc3BsYXkgPSAodG9rZW4udHlwZSA/IHRva2VuLnR5cGUgKyBcIiB0b2tlbjogXCIgOiBcIlwiKSArIEpTT04uc3RyaW5naWZ5KHRva2VuLnZhbHVlICE9PSB1bmRlZmluZWQgPyB0b2tlbi52YWx1ZSA6IHRva2VuKTtcbiAgICAgICAgdmFyIGxleGVyTWVzc2FnZSA9IHRoaXMubGV4ZXIuZm9ybWF0RXJyb3IodG9rZW4sIFwiU3ludGF4IGVycm9yXCIpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZXBvcnRFcnJvckNvbW1vbihsZXhlck1lc3NhZ2UsIHRva2VuRGlzcGxheSk7XG4gICAgfTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUucmVwb3J0RXJyb3JDb21tb24gPSBmdW5jdGlvbihsZXhlck1lc3NhZ2UsIHRva2VuRGlzcGxheSkge1xuICAgICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgICAgbGluZXMucHVzaChsZXhlck1lc3NhZ2UpO1xuICAgICAgICB2YXIgbGFzdENvbHVtbkluZGV4ID0gdGhpcy50YWJsZS5sZW5ndGggLSAyO1xuICAgICAgICB2YXIgbGFzdENvbHVtbiA9IHRoaXMudGFibGVbbGFzdENvbHVtbkluZGV4XTtcbiAgICAgICAgdmFyIGV4cGVjdGFudFN0YXRlcyA9IGxhc3RDb2x1bW4uc3RhdGVzXG4gICAgICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uKHN0YXRlKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5leHRTeW1ib2wgPSBzdGF0ZS5ydWxlLnN5bWJvbHNbc3RhdGUuZG90XTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV4dFN5bWJvbCAmJiB0eXBlb2YgbmV4dFN5bWJvbCAhPT0gXCJzdHJpbmdcIjtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChleHBlY3RhbnRTdGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCdVbmV4cGVjdGVkICcgKyB0b2tlbkRpc3BsYXkgKyAnLiBJIGRpZCBub3QgZXhwZWN0IGFueSBtb3JlIGlucHV0LiBIZXJlIGlzIHRoZSBzdGF0ZSBvZiBteSBwYXJzZSB0YWJsZTpcXG4nKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheVN0YXRlU3RhY2sobGFzdENvbHVtbi5zdGF0ZXMsIGxpbmVzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJ1VuZXhwZWN0ZWQgJyArIHRva2VuRGlzcGxheSArICcuIEluc3RlYWQsIEkgd2FzIGV4cGVjdGluZyB0byBzZWUgb25lIG9mIHRoZSBmb2xsb3dpbmc6XFxuJyk7XG4gICAgICAgICAgICAvLyBEaXNwbGF5IGEgXCJzdGF0ZSBzdGFja1wiIGZvciBlYWNoIGV4cGVjdGFudCBzdGF0ZVxuICAgICAgICAgICAgLy8gLSB3aGljaCBzaG93cyB5b3UgaG93IHRoaXMgc3RhdGUgY2FtZSB0byBiZSwgc3RlcCBieSBzdGVwLlxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBkZXJpdmF0aW9uLCB3ZSBvbmx5IGRpc3BsYXkgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIHZhciBzdGF0ZVN0YWNrcyA9IGV4cGVjdGFudFN0YXRlc1xuICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24oc3RhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYnVpbGRGaXJzdFN0YXRlU3RhY2soc3RhdGUsIFtdKSB8fCBbc3RhdGVdO1xuICAgICAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICAgICAgLy8gRGlzcGxheSBlYWNoIHN0YXRlIHRoYXQgaXMgZXhwZWN0aW5nIGEgdGVybWluYWwgc3ltYm9sIG5leHQuXG4gICAgICAgICAgICBzdGF0ZVN0YWNrcy5mb3JFYWNoKGZ1bmN0aW9uKHN0YXRlU3RhY2spIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdGF0ZVN0YWNrWzBdO1xuICAgICAgICAgICAgICAgIHZhciBuZXh0U3ltYm9sID0gc3RhdGUucnVsZS5zeW1ib2xzW3N0YXRlLmRvdF07XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbERpc3BsYXkgPSB0aGlzLmdldFN5bWJvbERpc3BsYXkobmV4dFN5bWJvbCk7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCgnQSAnICsgc3ltYm9sRGlzcGxheSArICcgYmFzZWQgb246Jyk7XG4gICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5U3RhdGVTdGFjayhzdGF0ZVN0YWNrLCBsaW5lcyk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBsaW5lcy5wdXNoKFwiXCIpO1xuICAgICAgICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcbiAgICB9XG4gICAgXG4gICAgUGFyc2VyLnByb3RvdHlwZS5kaXNwbGF5U3RhdGVTdGFjayA9IGZ1bmN0aW9uKHN0YXRlU3RhY2ssIGxpbmVzKSB7XG4gICAgICAgIHZhciBsYXN0RGlzcGxheTtcbiAgICAgICAgdmFyIHNhbWVEaXNwbGF5Q291bnQgPSAwO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHN0YXRlU3RhY2subGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0YXRlU3RhY2tbal07XG4gICAgICAgICAgICB2YXIgZGlzcGxheSA9IHN0YXRlLnJ1bGUudG9TdHJpbmcoc3RhdGUuZG90KTtcbiAgICAgICAgICAgIGlmIChkaXNwbGF5ID09PSBsYXN0RGlzcGxheSkge1xuICAgICAgICAgICAgICAgIHNhbWVEaXNwbGF5Q291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHNhbWVEaXNwbGF5Q291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJyAgICBeICcgKyBzYW1lRGlzcGxheUNvdW50ICsgJyBtb3JlIGxpbmVzIGlkZW50aWNhbCB0byB0aGlzJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNhbWVEaXNwbGF5Q291bnQgPSAwO1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJyAgICAnICsgZGlzcGxheSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0RGlzcGxheSA9IGRpc3BsYXk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5nZXRTeW1ib2xEaXNwbGF5ID0gZnVuY3Rpb24oc3ltYm9sKSB7XG4gICAgICAgIHJldHVybiBnZXRTeW1ib2xMb25nRGlzcGxheShzeW1ib2wpO1xuICAgIH07XG5cbiAgICAvKlxuICAgIEJ1aWxkcyBhIHRoZSBmaXJzdCBzdGF0ZSBzdGFjay4gWW91IGNhbiB0aGluayBvZiBhIHN0YXRlIHN0YWNrIGFzIHRoZSBjYWxsIHN0YWNrXG4gICAgb2YgdGhlIHJlY3Vyc2l2ZS1kZXNjZW50IHBhcnNlciB3aGljaCB0aGUgTmVhcmxleSBwYXJzZSBhbGdvcml0aG0gc2ltdWxhdGVzLlxuICAgIEEgc3RhdGUgc3RhY2sgaXMgcmVwcmVzZW50ZWQgYXMgYW4gYXJyYXkgb2Ygc3RhdGUgb2JqZWN0cy4gV2l0aGluIGFcbiAgICBzdGF0ZSBzdGFjaywgdGhlIGZpcnN0IGl0ZW0gb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIHN0YXJ0aW5nXG4gICAgc3RhdGUsIHdpdGggZWFjaCBzdWNjZXNzaXZlIGl0ZW0gaW4gdGhlIGFycmF5IGdvaW5nIGZ1cnRoZXIgYmFjayBpbnRvIGhpc3RvcnkuXG5cbiAgICBUaGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIGdpdmVuIGEgc3RhcnRpbmcgc3RhdGUgYW5kIGFuIGVtcHR5IGFycmF5IHJlcHJlc2VudGluZ1xuICAgIHRoZSB2aXNpdGVkIHN0YXRlcywgYW5kIGl0IHJldHVybnMgYW4gc2luZ2xlIHN0YXRlIHN0YWNrLlxuXG4gICAgKi9cbiAgICBQYXJzZXIucHJvdG90eXBlLmJ1aWxkRmlyc3RTdGF0ZVN0YWNrID0gZnVuY3Rpb24oc3RhdGUsIHZpc2l0ZWQpIHtcbiAgICAgICAgaWYgKHZpc2l0ZWQuaW5kZXhPZihzdGF0ZSkgIT09IC0xKSB7XG4gICAgICAgICAgICAvLyBGb3VuZCBjeWNsZSwgcmV0dXJuIG51bGxcbiAgICAgICAgICAgIC8vIHRvIGVsaW1pbmF0ZSB0aGlzIHBhdGggZnJvbSB0aGUgcmVzdWx0cywgYmVjYXVzZVxuICAgICAgICAgICAgLy8gd2UgZG9uJ3Qga25vdyBob3cgdG8gZGlzcGxheSBpdCBtZWFuaW5nZnVsbHlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0ZS53YW50ZWRCeS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbc3RhdGVdO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwcmV2U3RhdGUgPSBzdGF0ZS53YW50ZWRCeVswXTtcbiAgICAgICAgdmFyIGNoaWxkVmlzaXRlZCA9IFtzdGF0ZV0uY29uY2F0KHZpc2l0ZWQpO1xuICAgICAgICB2YXIgY2hpbGRSZXN1bHQgPSB0aGlzLmJ1aWxkRmlyc3RTdGF0ZVN0YWNrKHByZXZTdGF0ZSwgY2hpbGRWaXNpdGVkKTtcbiAgICAgICAgaWYgKGNoaWxkUmVzdWx0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW3N0YXRlXS5jb25jYXQoY2hpbGRSZXN1bHQpO1xuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMudGFibGVbdGhpcy5jdXJyZW50XTtcbiAgICAgICAgY29sdW1uLmxleGVyU3RhdGUgPSB0aGlzLmxleGVyU3RhdGU7XG4gICAgICAgIHJldHVybiBjb2x1bW47XG4gICAgfTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUucmVzdG9yZSA9IGZ1bmN0aW9uKGNvbHVtbikge1xuICAgICAgICB2YXIgaW5kZXggPSBjb2x1bW4uaW5kZXg7XG4gICAgICAgIHRoaXMuY3VycmVudCA9IGluZGV4O1xuICAgICAgICB0aGlzLnRhYmxlW2luZGV4XSA9IGNvbHVtbjtcbiAgICAgICAgdGhpcy50YWJsZS5zcGxpY2UoaW5kZXggKyAxKTtcbiAgICAgICAgdGhpcy5sZXhlclN0YXRlID0gY29sdW1uLmxleGVyU3RhdGU7XG5cbiAgICAgICAgLy8gSW5jcmVtZW50YWxseSBrZWVwIHRyYWNrIG9mIHJlc3VsdHNcbiAgICAgICAgdGhpcy5yZXN1bHRzID0gdGhpcy5maW5pc2goKTtcbiAgICB9O1xuXG4gICAgLy8gbmIuIGRlcHJlY2F0ZWQ6IHVzZSBzYXZlL3Jlc3RvcmUgaW5zdGVhZCFcbiAgICBQYXJzZXIucHJvdG90eXBlLnJld2luZCA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAgIGlmICghdGhpcy5vcHRpb25zLmtlZXBIaXN0b3J5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldCBvcHRpb24gYGtlZXBIaXN0b3J5YCB0byBlbmFibGUgcmV3aW5kaW5nJylcbiAgICAgICAgfVxuICAgICAgICAvLyBuYi4gcmVjYWxsIGNvbHVtbiAodGFibGUpIGluZGljaWVzIGZhbGwgYmV0d2VlbiB0b2tlbiBpbmRpY2llcy5cbiAgICAgICAgLy8gICAgICAgIGNvbCAwICAgLS0gICB0b2tlbiAwICAgLS0gICBjb2wgMVxuICAgICAgICB0aGlzLnJlc3RvcmUodGhpcy50YWJsZVtpbmRleF0pO1xuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLmZpbmlzaCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBSZXR1cm4gdGhlIHBvc3NpYmxlIHBhcnNpbmdzXG4gICAgICAgIHZhciBjb25zaWRlcmF0aW9ucyA9IFtdO1xuICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLmdyYW1tYXIuc3RhcnQ7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLnRhYmxlW3RoaXMudGFibGUubGVuZ3RoIC0gMV1cbiAgICAgICAgY29sdW1uLnN0YXRlcy5mb3JFYWNoKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgICAgICBpZiAodC5ydWxlLm5hbWUgPT09IHN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICYmIHQuZG90ID09PSB0LnJ1bGUuc3ltYm9scy5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgJiYgdC5yZWZlcmVuY2UgPT09IDBcbiAgICAgICAgICAgICAgICAgICAgJiYgdC5kYXRhICE9PSBQYXJzZXIuZmFpbCkge1xuICAgICAgICAgICAgICAgIGNvbnNpZGVyYXRpb25zLnB1c2godCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY29uc2lkZXJhdGlvbnMubWFwKGZ1bmN0aW9uKGMpIHtyZXR1cm4gYy5kYXRhOyB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZ2V0U3ltYm9sTG9uZ0Rpc3BsYXkoc3ltYm9sKSB7XG4gICAgICAgIHZhciB0eXBlID0gdHlwZW9mIHN5bWJvbDtcbiAgICAgICAgaWYgKHR5cGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBzeW1ib2w7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKHN5bWJvbC5saXRlcmFsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHN5bWJvbC5saXRlcmFsKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdjaGFyYWN0ZXIgbWF0Y2hpbmcgJyArIHN5bWJvbDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3ltYm9sLnR5cGUgKyAnIHRva2VuJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnRlc3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3Rva2VuIG1hdGNoaW5nICcgKyBTdHJpbmcoc3ltYm9sLnRlc3QpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gc3ltYm9sIHR5cGU6ICcgKyBzeW1ib2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U3ltYm9sU2hvcnREaXNwbGF5KHN5bWJvbCkge1xuICAgICAgICB2YXIgdHlwZSA9IHR5cGVvZiBzeW1ib2w7XG4gICAgICAgIGlmICh0eXBlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gc3ltYm9sO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmIChzeW1ib2wubGl0ZXJhbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShzeW1ib2wubGl0ZXJhbCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN5bWJvbCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzeW1ib2wudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyUnICsgc3ltYm9sLnR5cGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN5bWJvbC50ZXN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICc8JyArIFN0cmluZyhzeW1ib2wudGVzdCkgKyAnPic7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBzeW1ib2wgdHlwZTogJyArIHN5bWJvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBQYXJzZXI6IFBhcnNlcixcbiAgICAgICAgR3JhbW1hcjogR3JhbW1hcixcbiAgICAgICAgUnVsZTogUnVsZSxcbiAgICB9O1xuXG59KSk7XG4iLCIvLyBHZW5lcmF0ZWQgYXV0b21hdGljYWxseSBieSBuZWFybGV5LCB2ZXJzaW9uIDIuMjAuMVxuLy8gaHR0cDovL2dpdGh1Yi5jb20vSGFyZG1hdGgxMjMvbmVhcmxleVxuKGZ1bmN0aW9uICgpIHtcbmZ1bmN0aW9uIGlkKHgpIHsgcmV0dXJuIHhbMF07IH1cbnZhciBncmFtbWFyID0ge1xuICAgIExleGVyOiB1bmRlZmluZWQsXG4gICAgUGFyc2VyUnVsZXM6IFtcbiAgICB7XCJuYW1lXCI6IFwiXyRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdfSxcbiAgICB7XCJuYW1lXCI6IFwiXyRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcIl8kZWJuZiQxXCIsIFwid3NjaGFyXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJfXCIsIFwic3ltYm9sc1wiOiBbXCJfJGVibmYkMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcIl9fJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wid3NjaGFyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwiX18kZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJfXyRlYm5mJDFcIiwgXCJ3c2NoYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gYXJycHVzaChkKSB7cmV0dXJuIGRbMF0uY29uY2F0KFtkWzFdXSk7fX0sXG4gICAge1wibmFtZVwiOiBcIl9fXCIsIFwic3ltYm9sc1wiOiBbXCJfXyRlYm5mJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ3c2NoYXJcIiwgXCJzeW1ib2xzXCI6IFsvWyBcXHRcXG5cXHZcXGZdL10sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1bnNpZ25lZF9pbnQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbL1swLTldL119LFxuICAgIHtcIm5hbWVcIjogXCJ1bnNpZ25lZF9pbnQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJ1bnNpZ25lZF9pbnQkZWJuZiQxXCIsIC9bMC05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJ1bnNpZ25lZF9pbnRcIiwgXCJzeW1ib2xzXCI6IFtcInVuc2lnbmVkX2ludCRlYm5mJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogXG4gICAgICAgIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUludChkWzBdLmpvaW4oXCJcIikpO1xuICAgICAgICB9XG4gICAgICAgIH0sXG4gICAge1wibmFtZVwiOiBcImludCRlYm5mJDEkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifV19LFxuICAgIHtcIm5hbWVcIjogXCJpbnQkZWJuZiQxJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIitcIn1dfSxcbiAgICB7XCJuYW1lXCI6IFwiaW50JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiaW50JGVibmYkMSRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJpbnQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImludCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcImludCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcImludCRlYm5mJDJcIiwgL1swLTldL10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gYXJycHVzaChkKSB7cmV0dXJuIGRbMF0uY29uY2F0KFtkWzFdXSk7fX0sXG4gICAge1wibmFtZVwiOiBcImludFwiLCBcInN5bWJvbHNcIjogW1wiaW50JGVibmYkMVwiLCBcImludCRlYm5mJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogXG4gICAgICAgIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIGlmIChkWzBdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KGRbMF1bMF0rZFsxXS5qb2luKFwiXCIpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KGRbMV0uam9pbihcIlwiKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgfSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJ1bnNpZ25lZF9kZWNpbWFsJGVibmYkMVwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogWy9bMC05XS9dfSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1widW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDIkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwgXCJ1bnNpZ25lZF9kZWNpbWFsJGVibmYkMiRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQyJHN1YmV4cHJlc3Npb24kMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInVuc2lnbmVkX2RlY2ltYWxcIiwgXCJzeW1ib2xzXCI6IFtcInVuc2lnbmVkX2RlY2ltYWwkZWJuZiQxXCIsIFwidW5zaWduZWRfZGVjaW1hbCRlYm5mJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogXG4gICAgICAgIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KFxuICAgICAgICAgICAgICAgIGRbMF0uam9pbihcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbMV0gPyBcIi5cIitkWzFdWzFdLmpvaW4oXCJcIikgOiBcIlwiKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB9LFxuICAgIHtcIm5hbWVcIjogXCJkZWNpbWFsJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi1cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcImRlY2ltYWwkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNpbWFsJGVibmYkMlwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogWy9bMC05XS9dfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwgXCJkZWNpbWFsJGVibmYkMyRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjaW1hbCRlYm5mJDNcIiwgXCJzeW1ib2xzXCI6IFtcImRlY2ltYWwkZWJuZiQzJHN1YmV4cHJlc3Npb24kMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImRlY2ltYWwkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImRlY2ltYWxcIiwgXCJzeW1ib2xzXCI6IFtcImRlY2ltYWwkZWJuZiQxXCIsIFwiZGVjaW1hbCRlYm5mJDJcIiwgXCJkZWNpbWFsJGVibmYkM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBcbiAgICAgICAgZnVuY3Rpb24oZCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoXG4gICAgICAgICAgICAgICAgKGRbMF0gfHwgXCJcIikgK1xuICAgICAgICAgICAgICAgIGRbMV0uam9pbihcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbMl0gPyBcIi5cIitkWzJdWzFdLmpvaW4oXCJcIikgOiBcIlwiKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB9LFxuICAgIHtcIm5hbWVcIjogXCJwZXJjZW50YWdlXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNpbWFsXCIsIHtcImxpdGVyYWxcIjpcIiVcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IFxuICAgICAgICBmdW5jdGlvbihkKSB7XG4gICAgICAgICAgICByZXR1cm4gZFswXS8xMDA7XG4gICAgICAgIH1cbiAgICAgICAgfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi1cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbL1swLTldL119LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJqc29uZmxvYXQkZWJuZiQyXCIsIC9bMC05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQzJHN1YmV4cHJlc3Npb24kMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFsvWzAtOV0vXX0sXG4gICAge1wibmFtZVwiOiBcImpzb25mbG9hdCRlYm5mJDMkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkMyRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCIsIC9bMC05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGFycnB1c2goZCkge3JldHVybiBkWzBdLmNvbmNhdChbZFsxXV0pO319LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQzJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi5cIn0sIFwianNvbmZsb2F0JGVibmYkMyRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkM1wiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkMyRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImpzb25mbG9hdCRlYm5mJDQkc3ViZXhwcmVzc2lvbiQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogWy9bKy1dL10sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQ0JHN1YmV4cHJlc3Npb24kMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDEkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbL1swLTldL119LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQ0JHN1YmV4cHJlc3Npb24kMSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcImpzb25mbG9hdCRlYm5mJDQkc3ViZXhwcmVzc2lvbiQxJGVibmYkMlwiLCAvWzAtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFsvW2VFXS8sIFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDEkZWJuZiQxXCIsIFwianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDEkZWJuZiQyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwianNvbmZsb2F0JGVibmYkNFwiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkNCRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJqc29uZmxvYXQkZWJuZiQ0XCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImpzb25mbG9hdFwiLCBcInN5bWJvbHNcIjogW1wianNvbmZsb2F0JGVibmYkMVwiLCBcImpzb25mbG9hdCRlYm5mJDJcIiwgXCJqc29uZmxvYXQkZWJuZiQzXCIsIFwianNvbmZsb2F0JGVibmYkNFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBcbiAgICAgICAgZnVuY3Rpb24oZCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoXG4gICAgICAgICAgICAgICAgKGRbMF0gfHwgXCJcIikgK1xuICAgICAgICAgICAgICAgIGRbMV0uam9pbihcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbMl0gPyBcIi5cIitkWzJdWzFdLmpvaW4oXCJcIikgOiBcIlwiKSArXG4gICAgICAgICAgICAgICAgKGRbM10gPyBcImVcIiArIChkWzNdWzFdIHx8IFwiK1wiKSArIGRbM11bMl0uam9pbihcIlwiKSA6IFwiXCIpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIH0sXG4gICAge1wibmFtZVwiOiBcImVxdWF0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJfXCIsIFwiZXhwcmVzc2lvblwiLCBcIl9cIl0sIFwicG9zdHByb2Nlc3NcIjogKGRhdGEpID0+IGRhdGFbMV19LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uXCIsIFwic3ltYm9sc1wiOiBbXCJleHByZXNzaW9uX0FcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0Ekc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiK1wifV19LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0Ekc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifV19LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0FcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fQVwiLCBcIl9cIiwgXCJleHByZXNzaW9uX0Ekc3ViZXhwcmVzc2lvbiQxXCIsIFwiX1wiLCBcImV4cHJlc3Npb25fQlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdvcGVyYXRpb24nLFxyXG4gICAgICAgICAgICBvcDogZGF0YVsyXVswXSxcclxuICAgICAgICAgICAgbGhzOiBkYXRhWzBdLFxyXG4gICAgICAgICAgICByaHM6IGRhdGFbNF1cclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0FcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fQlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQiRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIqXCJ9XX0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQiRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIvXCJ9XX0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQlwiLCBcInN5bWJvbHNcIjogW1wiZXhwcmVzc2lvbl9CXCIsIFwiX1wiLCBcImV4cHJlc3Npb25fQiRzdWJleHByZXNzaW9uJDFcIiwgXCJfXCIsIFwiZXhwcmVzc2lvbl9DXCJdLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ29wZXJhdGlvbicsXHJcbiAgICAgICAgICAgIG9wOiBkYXRhWzJdWzBdLFxyXG4gICAgICAgICAgICBsaHM6IGRhdGFbMF0sXHJcbiAgICAgICAgICAgIHJoczogZGF0YVs0XVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fQlwiLCBcInN5bWJvbHNcIjogW1wiZXhwcmVzc2lvbl9DXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwcmVzc2lvbl9DXCIsIFwic3ltYm9sc1wiOiBbXCJleHByZXNzaW9uX0NcIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIl5cIn0sIFwiX1wiLCBcImV4cHJlc3Npb25fRFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdvcGVyYXRpb24nLFxyXG4gICAgICAgICAgICBvcDogZGF0YVsyXSxcclxuICAgICAgICAgICAgbGhzOiBkYXRhWzBdLFxyXG4gICAgICAgICAgICByaHM6IGRhdGFbNF1cclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0NcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fRFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdfSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwcmVzc2lvbl9EJGVibmYkMSRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIsXCJ9LCBcIl9cIiwgXCJleHByZXNzaW9uXCIsIFwiX1wiXX0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJleHByZXNzaW9uX0QkZWJuZiQxJHN1YmV4cHJlc3Npb24kMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBhcnJwdXNoKGQpIHtyZXR1cm4gZFswXS5jb25jYXQoW2RbMV1dKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwcmVzc2lvbl9EXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvblwiLCB7XCJsaXRlcmFsXCI6XCIoXCJ9LCBcIl9cIiwgXCJleHByZXNzaW9uXCIsIFwiX1wiLCBcImV4cHJlc3Npb25fRCRlYm5mJDFcIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIilcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ2Z1bmN0aW9uJyxcclxuICAgICAgICAgICAgZnVuY3Rpb246IGRhdGFbMF0sXHJcbiAgICAgICAgICAgIGFyZ3M6IFtkYXRhWzNdLCAuLi5kYXRhWzVdLm1hcChkYXRhID0+IGRhdGFbMl0pXVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcImV4cHJlc3Npb25fRFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIihcIn0sIFwiX1wiLCBcImV4cHJlc3Npb25cIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIilcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IChkYXRhKSA9PiAoZGF0YVsyXSl9LFxuICAgIHtcIm5hbWVcIjogXCJleHByZXNzaW9uX0RcIiwgXCJzeW1ib2xzXCI6IFtcInRva2VuXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFtcImludFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInLFxyXG4gICAgICAgICAgICByZTogZGF0YVswXSxcclxuICAgICAgICAgICAgaW06IDBcclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJ0b2tlblwiLCBcInN5bWJvbHNcIjogW1wiZGVjaW1hbFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAgKGRhdGEpID0+ICh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInLFxyXG4gICAgICAgICAgICByZTogZGF0YVswXSxcclxuICAgICAgICAgICAgaW06IDBcclxuICAgICAgICB9KSB9LFxuICAgIHtcIm5hbWVcIjogXCJ0b2tlblwiLCBcInN5bWJvbHNcIjogW1wiaW50XCIsIHtcImxpdGVyYWxcIjpcImlcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ251bWJlcicsXHJcbiAgICAgICAgICAgIHJlOiAwLFxyXG4gICAgICAgICAgICBpbTogZGF0YVswXVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNpbWFsXCIsIHtcImxpdGVyYWxcIjpcImlcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICAoZGF0YSkgPT4gKHtcclxuICAgICAgICAgICAgdHlwZTogJ251bWJlcicsXHJcbiAgICAgICAgICAgIHJlOiAwLFxyXG4gICAgICAgICAgICBpbTogZGF0YVswXVxyXG4gICAgICAgIH0pIH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiaVwifV0sIFwicG9zdHByb2Nlc3NcIjogIChkYXRhKSA9PiAoe1xyXG4gICAgICAgICAgICB0eXBlOiAnbnVtYmVyJyxcclxuICAgICAgICAgICAgcmU6IDAsXHJcbiAgICAgICAgICAgIGltOiAxXHJcbiAgICAgICAgfSkgfSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ6XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwielwifSwge1wibGl0ZXJhbFwiOlwiJ1wifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFtcInRva2VuJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidG9rZW5cIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ0XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiZVwifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ0b2tlbiRzdHJpbmckMlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcInBcIn0sIHtcImxpdGVyYWxcIjpcImlcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInRva2VuXCIsIFwic3ltYm9sc1wiOiBbXCJ0b2tlbiRzdHJpbmckMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwic1wifSwge1wibGl0ZXJhbFwiOlwicVwifSwge1wibGl0ZXJhbFwiOlwiclwifSwge1wibGl0ZXJhbFwiOlwidFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJsXCJ9LCB7XCJsaXRlcmFsXCI6XCJvXCJ9LCB7XCJsaXRlcmFsXCI6XCJnXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckM1wiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcInNcIn0sIHtcImxpdGVyYWxcIjpcImlcIn0sIHtcImxpdGVyYWxcIjpcIm5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQ0XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiY1wifSwge1wibGl0ZXJhbFwiOlwib1wifSwge1wibGl0ZXJhbFwiOlwic1wifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQ0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDVcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ0XCJ9LCB7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJuXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDVcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckNlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcInNcIn0sIHtcImxpdGVyYWxcIjpcImlcIn0sIHtcImxpdGVyYWxcIjpcIm5cIn0sIHtcImxpdGVyYWxcIjpcImhcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckNlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQ3XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiY1wifSwge1wibGl0ZXJhbFwiOlwib1wifSwge1wibGl0ZXJhbFwiOlwic1wifSwge1wibGl0ZXJhbFwiOlwiaFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQ3XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDhcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ0XCJ9LCB7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJuXCJ9LCB7XCJsaXRlcmFsXCI6XCJoXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDhcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckOVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcImFcIn0sIHtcImxpdGVyYWxcIjpcInNcIn0sIHtcImxpdGVyYWxcIjpcImlcIn0sIHtcImxpdGVyYWxcIjpcIm5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckOVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQxMFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcImFcIn0sIHtcImxpdGVyYWxcIjpcImNcIn0sIHtcImxpdGVyYWxcIjpcIm9cIn0sIHtcImxpdGVyYWxcIjpcInNcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckMTBcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvbiRzdHJpbmckMTFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJ0XCJ9LCB7XCJsaXRlcmFsXCI6XCJhXCJ9LCB7XCJsaXRlcmFsXCI6XCJuXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJmdW5jdGlvblwiLCBcInN5bWJvbHNcIjogW1wiZnVuY3Rpb24kc3RyaW5nJDExXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb24kc3RyaW5nJDEyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiaVwifSwge1wibGl0ZXJhbFwiOlwidFwifSwge1wibGl0ZXJhbFwiOlwiZVwifSwge1wibGl0ZXJhbFwiOlwiclwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZnVuY3Rpb25cIiwgXCJzeW1ib2xzXCI6IFtcImZ1bmN0aW9uJHN0cmluZyQxMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uJHN0cmluZyQxM1wiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcImdcIn0sIHtcImxpdGVyYWxcIjpcImFcIn0sIHtcImxpdGVyYWxcIjpcIm1cIn0sIHtcImxpdGVyYWxcIjpcIm1cIn0sIHtcImxpdGVyYWxcIjpcImFcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImZ1bmN0aW9uXCIsIFwic3ltYm9sc1wiOiBbXCJmdW5jdGlvbiRzdHJpbmckMTNcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJvcGVyYXRvclwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIl5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwib3BlcmF0b3JcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIqXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIm9wZXJhdG9yXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiL1wifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJvcGVyYXRvclwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIitcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwib3BlcmF0b3JcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCItXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH1cbl1cbiAgLCBQYXJzZXJTdGFydDogXCJlcXVhdGlvblwiXG59XG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICBtb2R1bGUuZXhwb3J0cyA9IGdyYW1tYXI7XG59IGVsc2Uge1xuICAgd2luZG93LmdyYW1tYXIgPSBncmFtbWFyO1xufVxufSkoKTtcbiIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIvLyBnZXREZWZhdWx0RXhwb3J0IGZ1bmN0aW9uIGZvciBjb21wYXRpYmlsaXR5IHdpdGggbm9uLWhhcm1vbnkgbW9kdWxlc1xuX193ZWJwYWNrX3JlcXVpcmVfXy5uID0gKG1vZHVsZSkgPT4ge1xuXHR2YXIgZ2V0dGVyID0gbW9kdWxlICYmIG1vZHVsZS5fX2VzTW9kdWxlID9cblx0XHQoKSA9PiAobW9kdWxlWydkZWZhdWx0J10pIDpcblx0XHQoKSA9PiAobW9kdWxlKTtcblx0X193ZWJwYWNrX3JlcXVpcmVfXy5kKGdldHRlciwgeyBhOiBnZXR0ZXIgfSk7XG5cdHJldHVybiBnZXR0ZXI7XG59OyIsIi8vIGRlZmluZSBnZXR0ZXIgZnVuY3Rpb25zIGZvciBoYXJtb255IGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uZCA9IChleHBvcnRzLCBkZWZpbml0aW9uKSA9PiB7XG5cdGZvcih2YXIga2V5IGluIGRlZmluaXRpb24pIHtcblx0XHRpZihfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZGVmaW5pdGlvbiwga2V5KSAmJiAhX193ZWJwYWNrX3JlcXVpcmVfXy5vKGV4cG9ydHMsIGtleSkpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBrZXksIHsgZW51bWVyYWJsZTogdHJ1ZSwgZ2V0OiBkZWZpbml0aW9uW2tleV0gfSk7XG5cdFx0fVxuXHR9XG59OyIsIl9fd2VicGFja19yZXF1aXJlX18ubyA9IChvYmosIHByb3ApID0+IChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKSkiLCIvLyBkZWZpbmUgX19lc01vZHVsZSBvbiBleHBvcnRzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLnIgPSAoZXhwb3J0cykgPT4ge1xuXHRpZih0eXBlb2YgU3ltYm9sICE9PSAndW5kZWZpbmVkJyAmJiBTeW1ib2wudG9TdHJpbmdUYWcpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgU3ltYm9sLnRvU3RyaW5nVGFnLCB7IHZhbHVlOiAnTW9kdWxlJyB9KTtcblx0fVxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xufTsiLCJpbXBvcnQgKiBhcyBuZWFybGV5IGZyb20gXCJuZWFybGV5XCI7XHJcbmltcG9ydCAqIGFzIGdyYW1tYXIgZnJvbSBcIi4vZ3JhbW1hclwiO1xyXG5cclxuY29uc3Qgc2NyZWVuRGltcyA9IGRvY3VtZW50LmJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbmNvbnN0IHNjcmVlbl93ID0gc2NyZWVuRGltcy53aWR0aDtcclxuY29uc3Qgc2NyZWVuX2ggPSBzY3JlZW5EaW1zLmhlaWdodDtcclxuY29uc3Qgc2NyZWVuRGltZW5zaW9uID0gW3NjcmVlbl93ICogMC43NSwgc2NyZWVuX2hdO1xyXG5cclxuY29uc3QgbWFpbkNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYWluLWNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG5tYWluQ2FudmFzLndpZHRoID0gc2NyZWVuRGltZW5zaW9uWzBdO1xyXG5tYWluQ2FudmFzLmhlaWdodCA9IHNjcmVlbkRpbWVuc2lvblsxXTtcclxuXHJcbi8vIGhhbmRsZSB3aW5kb3cgcmVzaXppbmdcclxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsICgpID0+IHtcclxuICAgIGNvbnN0IHNjcmVlbkRpbXMgPSBkb2N1bWVudC5ib2R5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgc2NyZWVuX3cgPSBzY3JlZW5EaW1zLndpZHRoO1xyXG4gICAgY29uc3Qgc2NyZWVuX2ggPSBzY3JlZW5EaW1zLmhlaWdodDtcclxuICAgIHNjcmVlbkRpbWVuc2lvblswXSA9IHNjcmVlbl93ICogMC43NTtcclxuICAgIHNjcmVlbkRpbWVuc2lvblsxXSA9IHNjcmVlbl9oO1xyXG5cclxuICAgIG1haW5DYW52YXMud2lkdGggPSBzY3JlZW5EaW1lbnNpb25bMF07XHJcbiAgICBtYWluQ2FudmFzLmhlaWdodCA9IHNjcmVlbkRpbWVuc2lvblsxXTtcclxufSk7XHJcblxyXG4vLyBoYW5kbGUgc2Nyb2xsIHdoZWVsXHJcbmxldCBsaW5lYXJfem9vbSA9IDAuNTtcclxubGV0IGxvZ196b29tID0gTWF0aC5leHAobGluZWFyX3pvb20pO1xyXG5tYWluQ2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ3doZWVsJywgKGV2KSA9PiB7XHJcbiAgICBjb25zdCBkaXJlY3Rpb24gPSBldi5kZWx0YVkgLyAxMDAwO1xyXG4gICAgbGluZWFyX3pvb20gKz0gZGlyZWN0aW9uO1xyXG4gICAgbGV0IHByZXZfbG9nX3pvb20gPSBsb2dfem9vbTtcclxuICAgIGxvZ196b29tID0gTWF0aC5leHAobGluZWFyX3pvb20pXHJcblxyXG4gICAgcG9zaXRpb25bMF0gKz0gKGV2Lm9mZnNldFggLSAoc2NyZWVuRGltZW5zaW9uWzBdIC8gMikpICogKGxvZ196b29tIC0gcHJldl9sb2dfem9vbSlcclxuICAgIHBvc2l0aW9uWzFdICs9IChldi5vZmZzZXRZIC0gKHNjcmVlbkRpbWVuc2lvblsxXSAvIDIpKSAqIChsb2dfem9vbSAtIHByZXZfbG9nX3pvb20pXHJcbn0pO1xyXG5cclxuLy8gaGFuZGxlIG1vdXNlIGRyYWcgZXZlbnRzXHJcbmxldCBtb3VzZURvd24gPSBmYWxzZTtcclxubGV0IHBvc2l0aW9uID0gWzAsIDBdO1xyXG5tYWluQ2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChldikgPT4ge1xyXG4gICAgbW91c2VEb3duID0gdHJ1ZTtcclxufSk7XHJcbm1haW5DYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgKGV2KSA9PiB7XHJcbiAgICBpZighbW91c2VEb3duKSByZXR1cm47XHJcblxyXG4gICAgcG9zaXRpb25bMF0gKz0gZXYubW92ZW1lbnRYICogbG9nX3pvb207XHJcbiAgICBwb3NpdGlvblsxXSArPSBldi5tb3ZlbWVudFkgKiBsb2dfem9vbTtcclxufSk7XHJcbm1haW5DYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIChldikgPT4ge1xyXG4gICAgbW91c2VEb3duID0gZmFsc2U7XHJcbn0pO1xyXG5tYWluQ2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoZXYpID0+IHtcclxuICAgIG1vdXNlRG93biA9IGZhbHNlO1xyXG59KTtcclxuXHJcbmNvbnN0IHJlc2V0Vmlld0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2aWV3LWJ0bicpO1xyXG5pZihyZXNldFZpZXdCdG4pIHJlc2V0Vmlld0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgIHBvc2l0aW9uID0gWzAsIDBdO1xyXG4gICAgbGluZWFyX3pvb20gPSAwLjU7XHJcbiAgICBsb2dfem9vbSA9IE1hdGguZXhwKGxpbmVhcl96b29tKTtcclxufSk7XHJcbmNvbnN0IHJlc2V0VGltZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0aW1lLWJ0bicpO1xyXG5pZihyZXNldFRpbWVCdG4pIHJlc2V0VGltZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgIGZyYW1lQ291bnQgPSAwO1xyXG59KTtcclxuXHJcbnR5cGUgR1BVID0ge1xyXG4gICAgYWRhcHRlcjogR1BVQWRhcHRlcixcclxuICAgIGRldmljZTogR1BVRGV2aWNlLFxyXG4gICAgY29udGV4dDogR1BVQ2FudmFzQ29udGV4dCxcclxuICAgIGZvcm1hdDogR1BVVGV4dHVyZUZvcm1hdFxyXG59XHJcblxyXG5jb25zdCBpbml0aWFsaXplID0gYXN5bmMgKCkgOiBQcm9taXNlPEdQVSB8IHVuZGVmaW5lZD4gPT4ge1xyXG4gICAgY29uc3QgYWRhcHRlciA9IGF3YWl0IG5hdmlnYXRvci5ncHUucmVxdWVzdEFkYXB0ZXIoKTtcclxuICAgIGlmKCFhZGFwdGVyKSByZXR1cm47XHJcbiAgICBjb25zdCBkZXZpY2UgPSBhd2FpdCBhZGFwdGVyLnJlcXVlc3REZXZpY2UoKTtcclxuXHJcbiAgICBjb25zdCBjb250ZXh0ID0gbWFpbkNhbnZhcy5nZXRDb250ZXh0KFwid2ViZ3B1XCIpO1xyXG4gICAgaWYoIWNvbnRleHQpIHJldHVybjtcclxuICAgIGNvbnN0IGZvcm1hdCA9IG5hdmlnYXRvci5ncHUuZ2V0UHJlZmVycmVkQ2FudmFzRm9ybWF0KCk7XHJcbiAgICBjb250ZXh0LmNvbmZpZ3VyZSh7IGRldmljZSwgZm9ybWF0IH0pO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYWRhcHRlcjogYWRhcHRlcixcclxuICAgICAgICBkZXZpY2U6IGRldmljZSxcclxuICAgICAgICBjb250ZXh0OiBjb250ZXh0LCBcclxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxyXG4gICAgfVxyXG59XHJcblxyXG5sZXQgY3VycmVudCA9IDA7XHJcbmxldCBmcmFtZUNvdW50ID0gMDtcclxuY29uc3QgY29tcGlsZSA9IGFzeW5jIChjb21tYW5kOiBzdHJpbmcsIGNvbmZpZzogR1BVLCBpZDogbnVtYmVyKSA9PiB7XHJcbiAgICAvLyBpbml0aWFsaXplIGdwdVxyXG4gICAgY29uc3Qge1xyXG4gICAgICAgIGFkYXB0ZXI6IGFkYXB0ZXIsXHJcbiAgICAgICAgZGV2aWNlOiBkZXZpY2UsXHJcbiAgICAgICAgY29udGV4dDogY29udGV4dCwgXHJcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcclxuICAgIH0gPSBjb25maWc7XHJcblxyXG4gICAgLy8gaW5pdCBidWZmZXJzIHRvIHBhc3MgdmFsdWVzIGluIHZpYSB1bmlmb3JtIGJ1ZmZlcnMsIDR4IGYzMnNcclxuICAgIGNvbnN0IGlvQnVmZmVyU2l6ZSA9IDQgKiA0O1xyXG4gICAgY29uc3QgaW9CdWZmZXIgPSBkZXZpY2UuY3JlYXRlQnVmZmVyKHtcclxuICAgICAgICBzaXplOiBpb0J1ZmZlclNpemUsXHJcbiAgICAgICAgdXNhZ2U6IEdQVUJ1ZmZlclVzYWdlLlVOSUZPUk0gfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVFxyXG4gICAgfSk7XHJcbiAgICBjb25zdCBpb0J1ZmZlcjIgPSBkZXZpY2UuY3JlYXRlQnVmZmVyKHtcclxuICAgICAgICBzaXplOiBpb0J1ZmZlclNpemUsXHJcbiAgICAgICAgdXNhZ2U6IEdQVUJ1ZmZlclVzYWdlLlVOSUZPUk0gfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVFxyXG4gICAgfSk7XHJcblxyXG4gICAgbGV0IHJlcyA9IGF3YWl0IGZldGNoKCcvc3JjL3Byb2dyYW0ud2dzbCcpXHJcbiAgICBsZXQgdGV4dCA9IGF3YWl0IHJlcy50ZXh0KCk7XHJcbiAgICBjb25zb2xlLmxvZyhjb21tYW5kKVxyXG4gICAgbGV0IGNvZGUgPSB0ZXh0LnJlcGxhY2UoJ1tbRVhQUl1dJywgY29tbWFuZCk7XHJcbiAgICBpZihpdGVyRmxhZyl7XHJcbiAgICAgICAgY29kZSArPSBgXFxuJHtpdGVyQ29kZX1gO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGNyZWF0ZSBncHUgcmVuZGVyaW5nIHBpcGVsaW5lXHJcbiAgICBjb25zdCBzaGFkZXJNb2R1bGUgPSBkZXZpY2UuY3JlYXRlU2hhZGVyTW9kdWxlKHsgY29kZSB9KTtcclxuICAgIGNvbnN0IHBpcGVsaW5lID0gZGV2aWNlLmNyZWF0ZVJlbmRlclBpcGVsaW5lKHtcclxuICAgICAgICBsYXlvdXQ6IFwiYXV0b1wiLFxyXG4gICAgICAgIHZlcnRleDoge1xyXG4gICAgICAgICAgICBtb2R1bGU6IHNoYWRlck1vZHVsZSxcclxuICAgICAgICAgICAgZW50cnlQb2ludDogXCJ2ZXJ0ZXhNYWluXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIGZyYWdtZW50OiB7XHJcbiAgICAgICAgICAgIG1vZHVsZTogc2hhZGVyTW9kdWxlLFxyXG4gICAgICAgICAgICBlbnRyeVBvaW50OiBcImZyYWdtZW50TWFpblwiLFxyXG4gICAgICAgICAgICB0YXJnZXRzOiBbeyBmb3JtYXQgfV0sXHJcbiAgICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHVuaWZvcm1CaW5kR3JvdXAgPSBkZXZpY2UuY3JlYXRlQmluZEdyb3VwKHtcclxuICAgICAgICBsYXlvdXQ6IHBpcGVsaW5lLmdldEJpbmRHcm91cExheW91dCgwKSxcclxuICAgICAgICBlbnRyaWVzOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGJpbmRpbmc6IDAsXHJcbiAgICAgICAgICAgICAgICByZXNvdXJjZToge1xyXG4gICAgICAgICAgICAgICAgICAgIGJ1ZmZlcjogaW9CdWZmZXJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgYmluZGluZzogMSxcclxuICAgICAgICAgICAgICAgIHJlc291cmNlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnVmZmVyOiBpb0J1ZmZlcjJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIF1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIGZwcyBjYWxjdWxhdGlvbiB2YXJpYWJsZXNcclxuICAgIGNvbnN0IGZwc0xhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZwcycpO1xyXG4gICAgbGV0IHByZXZUaW1lID0gbmV3IERhdGUoKTtcclxuICAgIGxldCBzZWNvbmRDb3VudGVyID0gbmV3IERhdGUoKTtcclxuICAgIGxldCBhdmdGcHM6IG51bWJlcjtcclxuICAgIGZyYW1lQ291bnQgPSAwO1xyXG4gICAgbGV0IGFscGhhID0gMC45NTtcclxuXHJcbiAgICBjb25zdCBmcmFtZSA9ICgpID0+IHtcclxuICAgICAgICAvLyB1cGRhdGUgdmFsdWVzIHRvIHBhc3MgaW4gdmlhIHVuaWZvcm0gYnVmZmVyc1xyXG4gICAgICAgIGRldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcihcclxuICAgICAgICAgICAgaW9CdWZmZXIsIDAsXHJcbiAgICAgICAgICAgIG5ldyBGbG9hdDMyQXJyYXkoW2xvZ196b29tLCBwb3NpdGlvblswXSwgcG9zaXRpb25bMV0sIGZyYW1lQ291bnRdKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKFxyXG4gICAgICAgICAgICBpb0J1ZmZlcjIsIDAsXHJcbiAgICAgICAgICAgIG5ldyBGbG9hdDMyQXJyYXkoW3NjcmVlbkRpbWVuc2lvblswXSwgc2NyZWVuRGltZW5zaW9uWzFdLCAwLCAwXSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBjcmVhdGUgZnVsbCBkcmF3IGNvbW1hbmQgZm9yIGdwdVxyXG4gICAgICAgIGNvbnN0IGNvbW1hbmRFbmNvZGVyID0gZGV2aWNlLmNyZWF0ZUNvbW1hbmRFbmNvZGVyKCk7XHJcbiAgICAgICAgY29uc3QgY29sb3JBdHRhY2htZW50cyA6IEdQVVJlbmRlclBhc3NDb2xvckF0dGFjaG1lbnRbXSA9IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdmlldzogY29udGV4dC5nZXRDdXJyZW50VGV4dHVyZSgpLmNyZWF0ZVZpZXcoKSxcclxuICAgICAgICAgICAgICAgIGxvYWRPcDogXCJjbGVhclwiLFxyXG4gICAgICAgICAgICAgICAgc3RvcmVPcDogXCJzdG9yZVwiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgY29uc3QgcGFzc0VuY29kZXIgPSBjb21tYW5kRW5jb2Rlci5iZWdpblJlbmRlclBhc3Moe2NvbG9yQXR0YWNobWVudHN9KTtcclxuICAgICAgICBwYXNzRW5jb2Rlci5zZXRQaXBlbGluZShwaXBlbGluZSk7XHJcbiAgICAgICAgcGFzc0VuY29kZXIuc2V0QmluZEdyb3VwKDAsIHVuaWZvcm1CaW5kR3JvdXApO1xyXG4gICAgICAgIHBhc3NFbmNvZGVyLmRyYXcoNik7XHJcbiAgICAgICAgcGFzc0VuY29kZXIuZW5kKCk7XHJcbiAgICAgICAgZGV2aWNlLnF1ZXVlLnN1Ym1pdChbY29tbWFuZEVuY29kZXIuZmluaXNoKCldKTtcclxuXHJcbiAgICAgICAgLy8gY2FsY3VsYXRlIGFuZCB1cGRhdGUgZnBzXHJcbiAgICAgICAgY29uc3QgbmV3VGltZSA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgZHQgPSBuZXdUaW1lLmdldFRpbWUoKSAtIHByZXZUaW1lLmdldFRpbWUoKTtcclxuICAgICAgICBsZXQgY3VyX2ZwcyA9IDEwMDAgLyBkdDtcclxuICAgICAgICBpZighYXZnRnBzKSBhdmdGcHMgPSBjdXJfZnBzO1xyXG4gICAgICAgIGlmKGF2Z0ZwcyA9PT0gSW5maW5pdHkpIGF2Z0ZwcyA9IDYwO1xyXG4gICAgICAgIGlmKGN1cl9mcHMgPT09IEluZmluaXR5KSBjdXJfZnBzID0gNjA7XHJcbiAgICAgICAgYXZnRnBzID0gYWxwaGEgKiBhdmdGcHMgKyAoMSAtIGFscGhhKSAqIGN1cl9mcHM7XHJcbiAgICAgICAgaWYobmV3VGltZS5nZXRUaW1lKCkgLSBzZWNvbmRDb3VudGVyLmdldFRpbWUoKSA+IDUwMCl7XHJcbiAgICAgICAgICAgIGlmKGZwc0xhYmVsKSBmcHNMYWJlbC5pbm5lclRleHQgPSBgRlBTOiAke01hdGgucm91bmQoYXZnRnBzKX1gO1xyXG4gICAgICAgICAgICBzZWNvbmRDb3VudGVyID0gbmV3VGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcHJldlRpbWUgPSBuZXdUaW1lO1xyXG4gICAgICAgIGZyYW1lQ291bnQrKztcclxuXHJcbiAgICAgICAgaWYoaWQgPT09IGN1cnJlbnQpIHJlcXVlc3RBbmltYXRpb25GcmFtZShmcmFtZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZyYW1lKCk7XHJcbn1cclxuXHJcbmxldCBncHVDb25maWc6IEdQVTtcclxuaW5pdGlhbGl6ZSgpLnRoZW4oKGNvbmZpZykgPT4ge1xyXG4gICAgaWYoIWNvbmZpZykgcmV0dXJuO1xyXG4gICAgZ3B1Q29uZmlnID0gY29uZmlnO1xyXG4gICAgY29tcGlsZShkZWZhdWx0Q29tbWFuZCwgY29uZmlnLCAwKTtcclxufSk7XHJcblxyXG4vLyBzZXQgdXAgaW5wdXQgY29tbWFuZCBwYXJzaW5nXHJcbmNvbnN0IGRlZmF1bHRDb21tYW5kID0gJ2NfZGl2KHZlYzJmKDEuMCwgMC4wKSwgeiknO1xyXG5sZXQgaXRlckZsYWcgPSBmYWxzZTtcclxubGV0IGl0ZXJDb2RlID0gYGA7XHJcbmNvbnN0IHBhcnNlSW5wdXQgPSAoczogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgbmVhcmxleS5QYXJzZXIobmVhcmxleS5HcmFtbWFyLmZyb21Db21waWxlZChncmFtbWFyKSk7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIHBhcnNlci5mZWVkKHMpO1xyXG4gICAgfSBjYXRjaChlKXtcclxuICAgICAgICByZXR1cm4gJyc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmKHBhcnNlci5yZXN1bHRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnOyAgICBcclxuICAgIGxldCByZXN1bHQgPSBwYXJzZXIucmVzdWx0c1swXTtcclxuICAgIGxldCBlcnJvciA9IGZhbHNlO1xyXG4gICAgaXRlckZsYWcgPSBmYWxzZTtcclxuICAgIGl0ZXJDb2RlID0gJyc7XHJcblxyXG4gICAgY29uc3QgZXhwYW5kID0gKHJlc3VsdDogYW55KTogc3RyaW5nID0+IHtcclxuICAgICAgICBpZih0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICBpZihyZXN1bHQgPT09ICdlJykgcmV0dXJuICd2ZWMyZigyLjcxODI4MTgyODQ1OTAsIDAuMCknO1xyXG4gICAgICAgICAgICBlbHNlIGlmKHJlc3VsdCA9PT0gJ3BpJykgcmV0dXJuICd2ZWMyZigzLjE0MTU5MjY1MzU4OTcsIDAuMCknO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmKHR5cGVvZiByZXN1bHQgPT09ICdudW1iZXInKXtcclxuICAgICAgICAgICAgcmV0dXJuIGB2ZWMyZigke3Jlc3VsdH0sIDAuMClgO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICAgIGlmKCFyZXN1bHQudHlwZSl7XHJcbiAgICAgICAgICAgICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKHJlc3VsdC50eXBlID09PSAnbnVtYmVyJyl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYHZlYzJmKCR7cmVzdWx0LnJlfSwgJHtyZXN1bHQuaW19KWA7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihyZXN1bHQudHlwZSA9PT0gJ29wZXJhdGlvbicpe1xyXG4gICAgICAgICAgICAgICAgbGV0IG9wID0gcmVzdWx0Lm9wO1xyXG4gICAgICAgICAgICAgICAgbGV0IGxocyA9IGV4cGFuZChyZXN1bHQubGhzKTtcclxuICAgICAgICAgICAgICAgIGxldCByaHMgPSBleHBhbmQocmVzdWx0LnJocyk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYob3AgPT09ICcrJyl7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjX2FkZCgke2xoc30sJHtyaHN9KWBcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihvcCA9PT0gJy0nKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYGNfc3ViKCR7bGhzfSwke3Joc30pYFxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKG9wID09PSAnKicpe1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgY19tdWwoJHtsaHN9LCR7cmhzfSlgXHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYob3AgPT09ICcvJyl7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjX2Rpdigke2xoc30sJHtyaHN9KWBcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihvcCA9PT0gJ14nKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYGNfcG93KCR7bGhzfSwke3Joc30pYFxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBlcnJvciA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYocmVzdWx0LnR5cGUgPT09ICdmdW5jdGlvbicpe1xyXG4gICAgICAgICAgICAgICAgbGV0IGZ1bmMgPSByZXN1bHQuZnVuY3Rpb247XHJcbiAgICAgICAgICAgICAgICBsZXQgYXJncyA9IHJlc3VsdC5hcmdzLm1hcCgoYXJnOiBhbnkpID0+IGV4cGFuZChhcmcpKTsgXHJcblxyXG4gICAgICAgICAgICAgICAgaWYoZnVuYyA9PT0gJ2l0ZXInKXtcclxuICAgICAgICAgICAgICAgICAgICBpZihhcmdzLmxlbmd0aCAhPT0gMikgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpdGVyQ29kZSA9IGBcclxuICAgICAgICAgICAgICAgICAgICBmbiBjX2l0ZXIoejogdmVjMmYpIC0+IHZlYzJmIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHRpbWU6IGYzMiA9IHVuaWZvcm1zWzNdIC8gMTAwMC4wOyAvLyBpbiBzZWNvbmRzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBkdDogZjMyID0gdGltZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHQgPSB2ZWMyZihkdCwgMC4wKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB6cCA9IHo7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcih2YXIgaSA9IDAuMDsgaSA8IGYzMigke2FyZ3NbMV19WzBdKTsgaSArPSAxLjApeyAvLyBudW1iZXJzIGFyZSBjb252ZXJ0ZWQgdG8gY29tcGxleFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgenAgPSAke2FyZ3NbMF0ucmVwbGFjZSgveicvZywgJ3pwJyl9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB6cDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYDtcclxuICAgICAgICAgICAgICAgICAgICBpdGVyRmxhZyA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgY19pdGVyKHopYDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjXyR7ZnVuY30oJHthcmdzLmpvaW4oJywnKX0pYDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGVycm9yID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHJldHVybiAnJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZXJyb3IgPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGxldCBleHBhbmRlZFJlc3VsdCA9IGV4cGFuZChyZXN1bHQpO1xyXG4gICAgaWYoZXhwYW5kZWRSZXN1bHQgPT09ICcnKXtcclxuICAgICAgICByZXR1cm4gJyc7XHJcbiAgICB9IGVsc2UgaWYoZXJyb3Ipe1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGV4cGFuZGVkUmVzdWx0O1xyXG4gICAgfVxyXG59XHJcbmNvbnN0IGZ1bmN0aW9uSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZnVuY3Rpb24taW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG5mdW5jdGlvbklucHV0LnZhbHVlID0gJzEveic7XHJcbmlmKGZ1bmN0aW9uSW5wdXQpe1xyXG4gICAgZnVuY3Rpb25JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHtcclxuICAgICAgICBjb25zdCByYXdJbnB1dCA9IGZ1bmN0aW9uSW5wdXQudmFsdWU7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHBhcnNlSW5wdXQocmF3SW5wdXQpO1xyXG4gICAgICAgIGN1cnJlbnQgKz0gMTtcclxuICAgICAgICBpZihyZXN1bHQgIT09ICcnKSBjb21waWxlKHJlc3VsdCwgZ3B1Q29uZmlnLCBjdXJyZW50KTtcclxuICAgIH0pO1xyXG59XHJcblxyXG4vKlxyXG5GYXZzOiBcclxuaXRlcigoeioodCsxKSleaSt6J15pLyh0KzEpLDEwKSBcclxuXHJcbiovIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9