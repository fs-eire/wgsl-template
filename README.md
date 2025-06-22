# WGSL-Template

A powerful template system for generating WGSL (WebGPU Shading Language) code with support for parameters, conditionals, and multiple output formats including C++ code generation.

## Usage

Install the NPM package for WGSL-Template:

```bash
npm install @fs-eire/wgsl-template
```

Use the CLI tool to build the template source folder:

```
npx wgsl-gen --input {path-to-source-folder} --output {path-to-target-folder} --generator {generator-name}
```

Or, use WGSL-Template in JavaScript code:

```js
import { build } from "@fs-eire/wgsl-template";

const buildResult = await build({
  sourceDir: "{path-to-source-folder}",
  outDir: "{path-to-target-folder}",
  generator: "static-cpp",
  templateExt: ".wgsl.template",
});
```

## How It Works

### Build Process

The template build process includes the following steps:

- File Loading: Load all template files with the specified extension from the specified source directory.
- Parsing (PASS1): Perform basic preprocessing and simple parsing.
- Generating (PASS2): Generate the target source snippet based on the specified generator.
- Building: Finalize and write the generated files to the specified output directory.

### Generators

A generator defines how the parsed template is transformed into the final output format.

WGSL-Template supports multiple generators to produce different output formats. The available generators include:

- `static-cpp`: Generates C++ code to construct WGSL code at runtime, using a string table.
- `static-cpp-literal`: Generates C++ code to construct WGSL code at runtime, using string literals.
- `dynamic`: Generates JavaScript code to construct WGSL code at runtime, which can be used to generate other formats dynamically based on implementation.

### Explanation with an Example

Please refer to the unit test `generator-example-pad` for a real-world example:

- [Source Template](./test/testcases/generator-example-pad/pad.wgsl.template)
- [Generated Output (static-cpp-literal)](./test/testcases/generator-example-pad/pad.wgsl.template.static-cpp-literal.gen)
- [Generated Output (dynamic)](./test/testcases/generator-example-pad/pad.wgsl.template.dynamic.gen)

## Template Syntax

### Comments

> Syntax: Same as C/C++ style comments

Comments in the template files are denoted by `//` for single-line comments and `/* ... */` for multi-line comments, which are same as in WGSL.

Comments will be removed in PASS1 and will not appear in the generated output.

### Preprocessor Directives

#### `#include`

> Syntax: `#include "relative/path/to/file"`

Includes another template file at the specified path. The path is relative to the base path, which is specified as the "--input" parameter in the CLI or the `sourceDir` option in the JavaScript API.

Includes can be nested, and circular includes will result in an error.

Includes are processed in PASS1, by simply replacing the `#include` directive with the content of the included file.

#### `#define`

> Syntax: `#define MACRO_NAME MACRO_VALUE`

Defines a preprocessor macro that can be used to replace text in the template. The syntax is similar to C/C++ preprocessor directives, but only simple text replacement is supported.

Defined macros are processed in PASS1, by replacing occurrences of the macro name with its defined value.

#### `#if`, `#elif`, `#else`, `#endif`

> Syntax:
>
> ```
> #if CONDITION
>   // code to include if CONDITION is true
> #elif ANOTHER_CONDITION
>   // code to include if ANOTHER_CONDITION is true
> #else
>   // code to include if none of the above conditions are true
> #endif
> ```

Conditional source code generation based on the evaluation of expressions. The syntax is similar to C/C++ preprocessor directives.

However, unlike C/C++, **the expressions are evaluated at runtime** based on the parameters provided. The generated code is expected to generate expected WGSL code based on the evaluation result at runtime.

Conditionals are processed in PASS2, by transforming into if-else statements.

#### `#param`

> Syntax: `#param PARAM_NAME1 [PARAM_NAME2 ...]`

Defines one or more parameters that can be used to customize the template. The parameters can be referenced in conditionals and other parts of the template.

Parameter names must be valid C/C++ identifiers. If multiple parameters are specified, they must be separated by spaces.

Parameters are processed in PASS2, by transforming into special variables.

#### `#use`

> Syntax: `#use UTILITY_NAME1 [UTILITY_NAME2 ...]`

Declares the use of one or more utilities in the template. See the following [Utilities](#utilities) section for more details.

## Utilities

Utilities are predefined macros, functions, properties or methods that can be used in the template to perform common tasks. They can be referenced in conditionals and other parts of the template.

See a list of available utilities in [src/code-pattern-impl.ts](./src/code-pattern-impl.ts)

## Contributing

Please feel free to submit issues or pull requests for any bugs, features, or improvements.

## License

MIT

See [LICENSE](./LICENSE) for more information.
