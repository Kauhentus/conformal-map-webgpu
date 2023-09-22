@builtin "whitespace.ne" # `_` means arbitrary amount of whitespace
@builtin "number.ne"     # `int`, `decimal`, and `percentage` number primitives

equation -> _ expression _ {% (data) => data[1] %}

expression -> expression_A {% id %}

expression_A -> expression_A _ ("+" | "-") _ expression_B {% (data) => ({
    type: 'operation',
    op: data[2][0],
    lhs: data[0],
    rhs: data[4]
}) %}
    | expression_B {% id %}

expression_B -> expression_B _ ("*" | "/") _ expression_C {% (data) => ({
    type: 'operation',
    op: data[2][0],
    lhs: data[0],
    rhs: data[4]
}) %}
    | expression_C {% id %}

expression_C -> expression_C _ "^" _ expression_D {% (data) => ({
    type: 'operation',
    op: data[2],
    lhs: data[0],
    rhs: data[4]
}) %}
    | expression_D {% id %}

expression_D -> function "(" _ expression _ ("," _ expression _ ):* _ ")" {% (data) => ({
    type: 'function',
    function: data[0],
    args: [data[3], ...data[5].map(data => data[2])]
}) %}
    | "(" _ expression _ ")" {% (data) => (data[2]) %}
    | token {% id %}

token -> 
      int {% (data) => ({
    type: 'number',
    re: data[0],
    im: 0
}) %}
    | decimal {% (data) => ({
    type: 'number',
    re: data[0],
    im: 0
}) %}
    | int "i" {% (data) => ({
    type: 'number',
    re: 0,
    im: data[0]
}) %}
    | decimal "i" {% (data) => ({
    type: 'number',
    re: 0,
    im: data[0]
}) %}
    | "i"  {% (data) => ({
    type: 'number',
    re: 0,
    im: 1
}) %}
    | "z"  {% id %}
    | "z'" {% id %}
    | "t" {% id %}
    | "e" {% id %}
    | "pi" {% id %}

function -> 
      "sqrt" {% id %}
    | "log" {% id %}

    | "sin" {% id %}
    | "cos" {% id %}
    | "tan" {% id %}
    | "sinh" {% id %}
    | "cosh" {% id %}
    | "tanh" {% id %}
    | "asin" {% id %}
    | "acos" {% id %}
    | "atan" {% id %}

    | "iter" {% id %}
    | "gamma" {% id %}
    # | "jacobi"{% id %}

operator -> 
      "^" {% id %}
    | "*" {% id %}
    | "/" {% id %}
    | "+" {% id %}
    | "-" {% id %}