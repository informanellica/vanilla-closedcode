/** @file ESLint flat config for the VS Code extension; lints JS files as ES2022 modules with curly/eqeqeq/no-throw-literal/semi warnings. */
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "warn",
    },
  },
]
