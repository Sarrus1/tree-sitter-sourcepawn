const PREC = {
  PAREN_DECLARATOR: -10,
  ASSIGNMENT: -1,
  CONDITIONAL: -2,
  DEFAULT: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  INCLUSIVE_OR: 3,
  EXCLUSIVE_OR: 4,
  BITWISE_AND: 5,
  EQUAL: 6,
  RELATIONAL: 7,
  SIZEOF: 8,
  SHIFT: 9,
  ADD: 10,
  MULTIPLY: 11,
  CAST: 12,
  UNARY: 13,
  CALL: 14,
  FIELD: 15,
  SUBSCRIPT: 16,
};

module.exports = grammar({
  name: "sourcepawn",

  extras: ($) => [/\s|\\\r?\n/, $.comment],

  inline: ($) => [
    $._statement,
    $._type_identifier,
    $._field_identifier,
    $._statement_identifier,
    $._assignment_left_expression,
  ],

  conflicts: ($) => [[$._type, $._expression]],

  word: ($) => $.symbol,

  rules: {
    source_file: ($) => repeat($._top_level_item),

    _top_level_item: ($) =>
      choice(
        $.function_declaration,
        $.function_definition,
        $._statement,
        $.preproc_include,
        $.preproc_def,
        $.preproc_if,
        $.preproc_endif,
        $.preproc_undef
      ),

    // Preprocesser

    preproc_include: ($) =>
      seq(
        preprocessor("include"),
        field("path", choice($.string_literal, $.system_lib_string)),
        "\n"
      ),

    preproc_def: ($) =>
      seq(
        preprocessor("define"),
        field("name", $.symbol),
        field("value", optional($.preproc_arg)),
        "\n"
      ),
    preproc_undef: ($) =>
      seq(preprocessor("undef"), field("name", $.symbol), "\n"),
    preproc_arg: ($) => token(prec(-1, repeat1(/.|\\\r?\n/))),

    preproc_if: ($) =>
      seq(preprocessor("if"), field("condition", $.symbol), "\n"),
    preproc_endif: ($) => seq(preprocessor("endif"), "\n"),

    // Main Grammar

    function_declaration: ($) =>
      prec(
        PREC.UNARY,
        seq(
          optional($.function_storage_class),
          field("returnType", optional($._type)),
          field("name", $.symbol),
          $.argument_declarations,
          $.block
        )
      ),
    function_storage_class: ($) =>
      choice("stock", "static", "stock static", "static stock"),

    function_definition: ($) =>
      seq(
        $.function_definition_type,
        field("returnType", optional($._type)),
        field("name", $.symbol),
        $.argument_declarations,
        optional($.semicolon)
      ),

    function_definition_type: ($) => choice("forward", "native"),

    argument_declarations: ($) =>
      seq(
        "(",
        optional(
          seq($.argument_declaration, repeat(seq(",", $.argument_declaration)))
        ),
        ")"
      ),
    argument_declaration: ($) =>
      prec(
        PREC.PAREN_DECLARATOR,
        seq(
          optional("const"),
          optional("&"),
          field("argumentType", optional($.type_expression)),
          optional("&"),
          field("name", $.symbol),
          repeat(choice($.dimension, $.fixed_dimension)),
          field(
            "defaultValue",
            optional(seq("=", choice($._literal, $.symbol)))
          )
        )
      ),

    type_expression: ($) => seq($._type, repeat($.dimension)),

    dimension: ($) => token(seq("[", "]")),
    fixed_dimension: ($) => seq("[", choice($.int_literal, $.symbol), "]"),

    _type: ($) =>
      choice($.builtin_type, $.old_builtin_type, seq($.symbol, optional(":"))),
    builtin_type: ($) => choice("void", "bool", "int", "float", "char"),
    old_builtin_type: ($) => seq(choice("_", "Float", "bool", "String"), ":"),

    block: ($) => seq("{", repeat($._statement), "}"),

    // Statements

    _statement: ($) =>
      choice($.block, $.return_statement, $.expression_statement),

    expression_statement: ($) =>
      seq(choice($._expression, $.comma_expression), optional($.semicolon)),

    return_statement: ($) =>
      prec.right(
        seq(
          "return",
          optional(choice($._expression, $.comma_expression)),
          optional($.semicolon)
        )
      ),

    semicolon: ($) => ";",

    // Expressions

    _expression: ($) =>
      choice(
        $.conditional_expression,
        $.assignment_expression,
        $.binary_expression,
        $.unary_expression,
        $.update_expression,
        $.sizeof_expression,
        $.symbol,
        $._literal,
        $.concatenated_string,
        $.char_literal,
        $.parenthesized_expression
      ),

    parenthesized_expression: ($) =>
      seq("(", choice($._expression, $.comma_expression), ")"),

    comma_expression: ($) =>
      seq(
        field("left", $._expression),
        ",",
        field("right", choice($._expression, $.comma_expression))
      ),

    conditional_expression: ($) =>
      prec.right(
        PREC.CONDITIONAL,
        seq(
          field("condition", $._expression),
          "?",
          field("consequence", $._expression),
          ":",
          field("alternative", $._expression)
        )
      ),

    _assignment_left_expression: ($) => choice($.symbol, $._expression),

    assignment_expression: ($) =>
      prec.right(
        PREC.ASSIGNMENT,
        seq(
          field("left", $._assignment_left_expression),
          choice(
            "=",
            "*=",
            "/=",
            "%=",
            "+=",
            "-=",
            "<<=",
            ">>=",
            "&=",
            "^=",
            "|="
          ),
          field("right", $._expression)
        )
      ),

    unary_expression: ($) =>
      prec.left(
        PREC.UNARY,
        seq(
          field("operator", choice("!", "~", "-", "+")),
          field("argument", $._expression)
        )
      ),

    binary_expression: ($) => {
      const table = [
        ["+", PREC.ADD],
        ["-", PREC.ADD],
        ["*", PREC.MULTIPLY],
        ["/", PREC.MULTIPLY],
        ["%", PREC.MULTIPLY],
        ["||", PREC.LOGICAL_OR],
        ["&&", PREC.LOGICAL_AND],
        ["|", PREC.INCLUSIVE_OR],
        ["^", PREC.EXCLUSIVE_OR],
        ["&", PREC.BITWISE_AND],
        ["==", PREC.EQUAL],
        ["!=", PREC.EQUAL],
        [">", PREC.RELATIONAL],
        [">=", PREC.RELATIONAL],
        ["<=", PREC.RELATIONAL],
        ["<", PREC.RELATIONAL],
        ["<<", PREC.SHIFT],
        [">>", PREC.SHIFT],
      ];

      return choice(
        ...table.map(([operator, precedence]) => {
          return prec.left(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression)
            )
          );
        })
      );
    },

    update_expression: ($) => {
      const argument = field("argument", $._expression);
      const operator = field("operator", choice("--", "++"));
      return prec.right(
        PREC.UNARY,
        choice(seq(operator, argument), seq(argument, operator))
      );
    },

    sizeof_expression: ($) =>
      prec(PREC.SIZEOF, seq("sizeof", seq("(", field("type", $.symbol), ")"))),

    _literal: ($) =>
      prec(
        10,
        choice(
          $.int_literal,
          $.float_literal,
          $.char_literal,
          $.string_literal,
          $.concatenated_string,
          $.bool_literal,
          $.null
        )
      ),

    int_literal: ($) => {
      const separator = "'";
      const hex = /[0-9a-fA-F]/;
      const decimal = /[0-9]/;
      const hexDigits = seq(repeat1(hex), repeat(seq(separator, repeat1(hex))));
      const decimalDigits = seq(
        repeat1(decimal),
        repeat(seq(separator, repeat1(decimal)))
      );
      return token(
        seq(
          optional(/[-\+]/),
          choice(decimalDigits, seq("0b", decimalDigits), seq("0x", hexDigits)),
          optional(seq(/[eEpP]/, optional(seq(optional(/[-\+]/), hexDigits))))
        )
      );
    },

    float_literal: ($) => {
      const separator = "'";
      const decimal = /[0-9]/;
      const decimalDigits = seq(
        repeat1(decimal),
        repeat(seq(separator, repeat1(decimal)))
      );
      return token(
        seq(
          optional(/[-\+]/),
          choice(
            seq(decimalDigits, optional(seq(".", optional(decimalDigits)))),
            seq(".", decimalDigits)
          )
        )
      );
    },

    char_literal: ($) =>
      seq("'", choice($.escape_sequence, token.immediate(/[^\n']/)), "'"),

    concatenated_string: ($) =>
      prec.left(seq($.string_literal, repeat1($.string_literal))),

    string_literal: ($) =>
      seq(
        '"',
        repeat(
          choice(token.immediate(prec(1, /[^\\"\n]+/)), $.escape_sequence)
        ),
        '"'
      ),

    escape_sequence: ($) =>
      token(
        prec(
          1,
          seq(
            "\\",
            choice(
              /[^xuU]/,
              /\d{2,3}/,
              /x[0-9a-fA-F]{2,}/,
              /u[0-9a-fA-F]{4}/,
              /U[0-9a-fA-F]{8}/
            )
          )
        )
      ),

    bool_literal: ($) => token(choice("true", "false")),
    null: ($) => "null",

    system_lib_string: ($) =>
      token(seq("<", repeat(choice(/[^>\n]/, "\\>")), ">")),

    symbol: ($) => /[a-zA-Z_]\w*/,

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: ($) =>
      token(
        choice(
          seq("//", /(\\(.|\r?\n)|[^\\\n])*/),
          seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")
        )
      ),
  },

  supertypes: ($) => [$._expression, $._statement],
});

module.exports.PREC = PREC;

function preprocessor(command) {
  return alias(new RegExp("#[ \t]*" + command), "#" + command);
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}