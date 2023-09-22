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
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
