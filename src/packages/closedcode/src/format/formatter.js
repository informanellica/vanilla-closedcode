/** @file Registry of code formatter definitions. Each entry declares the file extensions it handles and an async `enabled(context)` that detects the tool/config and returns the command template (with `$FILE` placeholder), or false when not applicable. */
import { Npm } from "core/npm";
import { Filesystem } from "#util/filesystem.js";
import { Process } from "#util/process.js";
import { which } from "../util/which.js";
import { Flag } from "core/flag/flag";
/**
 * gofmt formatter for Go files. Enabled when `gofmt` is on PATH.
 * `enabled()` returns the command array or false.
 * @type {Object}
 */
export const gofmt = {
  name: "gofmt",
  extensions: [".go"],
  async enabled() {
    const match = which("gofmt");
    if (!match) return false;
    return [match, "-w", "$FILE"];
  }
};
/**
 * mix formatter for Elixir files. Enabled when `mix` is on PATH.
 * @type {Object}
 */
export const mix = {
  name: "mix",
  extensions: [".ex", ".exs", ".eex", ".heex", ".leex", ".neex", ".sface"],
  async enabled() {
    const match = which("mix");
    if (!match) return false;
    return [match, "format", "$FILE"];
  }
};
/**
 * Prettier formatter for web/JS/TS and many config/markup files.
 * `enabled(context)` walks up from context.directory to context.worktree looking for a
 * package.json that lists prettier as a (dev)dependency, then resolves the binary via npm.
 * @type {Object}
 */
export const prettier = {
  name: "prettier",
  extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".md", ".mdx", ".graphql", ".gql"],
  async enabled(context) {
    const items = await Filesystem.findUp("package.json", context.directory, context.worktree);
    for (const item of items) {
      const json = await Filesystem.readJson(item);
      if (json.dependencies?.prettier || json.devDependencies?.prettier) {
        const bin = await Npm.which("prettier");
        if (bin) return [bin, "--write", "$FILE"];
      }
    }
    return false;
  }
};
/**
 * oxfmt formatter for JS/TS files (gated behind the experimental flag).
 * `enabled(context)` requires the flag and an oxfmt (dev)dependency in a nearby package.json.
 * @type {Object}
 */
export const oxfmt = {
  name: "oxfmt",
  extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"],
  async enabled(context) {
    if (!Flag.CLOSEDCODE_EXPERIMENTAL_OXFMT) return false;
    const items = await Filesystem.findUp("package.json", context.directory, context.worktree);
    for (const item of items) {
      const json = await Filesystem.readJson(item);
      if (json.dependencies?.oxfmt || json.devDependencies?.oxfmt) {
        const bin = await Npm.which("oxfmt");
        if (bin) return [bin, "$FILE"];
      }
    }
    return false;
  }
};
/**
 * Biome formatter for web/JS/TS and config/markup files.
 * `enabled(context)` looks for biome.json/biome.jsonc up the tree, then resolves @biomejs/biome via npm.
 * @type {Object}
 */
export const biome = {
  name: "biome",
  extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".md", ".mdx", ".graphql", ".gql"],
  async enabled(context) {
    const configs = ["biome.json", "biome.jsonc"];
    for (const config of configs) {
      const found = await Filesystem.findUp(config, context.directory, context.worktree);
      if (found.length > 0) {
        const bin = await Npm.which("@biomejs/biome");
        if (bin) return [bin, "format", "--write", "$FILE"];
      }
    }
    return false;
  }
};
/**
 * zig formatter for Zig files. Enabled when `zig` is on PATH.
 * @type {Object}
 */
export const zig = {
  name: "zig",
  extensions: [".zig", ".zon"],
  async enabled() {
    const match = which("zig");
    if (!match) return false;
    return [match, "fmt", "$FILE"];
  }
};
/**
 * clang-format formatter for C/C++ files.
 * `enabled(context)` requires a .clang-format config up the tree and clang-format on PATH.
 * @type {Object}
 */
export const clang = {
  name: "clang-format",
  extensions: [".c", ".cc", ".cpp", ".cxx", ".c++", ".h", ".hh", ".hpp", ".hxx", ".h++", ".ino", ".C", ".H"],
  async enabled(context) {
    const items = await Filesystem.findUp(".clang-format", context.directory, context.worktree);
    if (items.length > 0) {
      const match = which("clang-format");
      if (match) return [match, "-i", "$FILE"];
    }
    return false;
  }
};
/**
 * ktlint formatter for Kotlin files. Enabled when `ktlint` is on PATH.
 * @type {Object}
 */
export const ktlint = {
  name: "ktlint",
  extensions: [".kt", ".kts"],
  async enabled() {
    const match = which("ktlint");
    if (!match) return false;
    return [match, "-F", "$FILE"];
  }
};
/**
 * ruff formatter for Python files.
 * `enabled(context)` requires ruff on PATH plus either a ruff config (with [tool.ruff] when in
 * pyproject.toml) or a dependency manifest that mentions ruff.
 * @type {Object}
 */
export const ruff = {
  name: "ruff",
  extensions: [".py", ".pyi"],
  async enabled(context) {
    if (!which("ruff")) return false;
    const configs = ["pyproject.toml", "ruff.toml", ".ruff.toml"];
    for (const config of configs) {
      const found = await Filesystem.findUp(config, context.directory, context.worktree);
      if (found.length > 0) {
        if (config === "pyproject.toml") {
          const content = await Filesystem.readText(found[0]);
          if (content.includes("[tool.ruff]")) return ["ruff", "format", "$FILE"];
        } else {
          return ["ruff", "format", "$FILE"];
        }
      }
    }
    const deps = ["requirements.txt", "pyproject.toml", "Pipfile"];
    for (const dep of deps) {
      const found = await Filesystem.findUp(dep, context.directory, context.worktree);
      if (found.length > 0) {
        const content = await Filesystem.readText(found[0]);
        if (content.includes("ruff")) return ["ruff", "format", "$FILE"];
      }
    }
    return false;
  }
};
/**
 * air formatter for R files.
 * `enabled()` confirms the `air` binary is the R language server/formatter via its --help output.
 * @type {Object}
 */
export const rlang = {
  name: "air",
  extensions: [".R"],
  async enabled() {
    const air = which("air");
    if (air == null) return false;
    const output = await Process.text([air, "--help"], {
      nothrow: true
    });

    // Check for "Air: An R language server and formatter"
    const firstLine = output.text.split("\n")[0];
    const hasR = firstLine.includes("R language");
    const hasFormatter = firstLine.includes("formatter");
    if (output.code === 0 && hasR && hasFormatter) return [air, "format", "$FILE"];
    return false;
  }
};
/**
 * uv formatter for Python files, used only when ruff is not already enabled.
 * `enabled(context)` checks uv is on PATH and supports `format` via its --help output.
 * @type {Object}
 */
export const uvformat = {
  name: "uv",
  extensions: [".py", ".pyi"],
  async enabled(context) {
    if (await ruff.enabled(context)) return false;
    const uv = which("uv");
    if (uv == null) return false;
    const output = await Process.run([uv, "format", "--help"], {
      nothrow: true
    });
    if (output.code === 0) return [uv, "format", "--", "$FILE"];
    return false;
  }
};
/**
 * rubocop formatter for Ruby files. Enabled when `rubocop` is on PATH.
 * @type {Object}
 */
export const rubocop = {
  name: "rubocop",
  extensions: [".rb", ".rake", ".gemspec", ".ru"],
  async enabled() {
    const match = which("rubocop");
    if (!match) return false;
    return [match, "--autocorrect", "$FILE"];
  }
};
/**
 * standardrb formatter for Ruby files. Enabled when `standardrb` is on PATH.
 * @type {Object}
 */
export const standardrb = {
  name: "standardrb",
  extensions: [".rb", ".rake", ".gemspec", ".ru"],
  async enabled() {
    const match = which("standardrb");
    if (!match) return false;
    return [match, "--fix", "$FILE"];
  }
};
/**
 * htmlbeautifier formatter for ERB/HTML-ERB files. Enabled when `htmlbeautifier` is on PATH.
 * @type {Object}
 */
export const htmlbeautifier = {
  name: "htmlbeautifier",
  extensions: [".erb", ".html.erb"],
  async enabled() {
    const match = which("htmlbeautifier");
    if (!match) return false;
    return [match, "$FILE"];
  }
};
/**
 * dart formatter for Dart files. Enabled when `dart` is on PATH.
 * @type {Object}
 */
export const dart = {
  name: "dart",
  extensions: [".dart"],
  async enabled() {
    const match = which("dart");
    if (!match) return false;
    return [match, "format", "$FILE"];
  }
};
/**
 * ocamlformat formatter for OCaml files.
 * `enabled(context)` requires ocamlformat on PATH and a .ocamlformat config up the tree.
 * @type {Object}
 */
export const ocamlformat = {
  name: "ocamlformat",
  extensions: [".ml", ".mli"],
  async enabled(context) {
    if (!which("ocamlformat")) return false;
    const items = await Filesystem.findUp(".ocamlformat", context.directory, context.worktree);
    if (items.length > 0) return ["ocamlformat", "-i", "$FILE"];
    return false;
  }
};
/**
 * terraform formatter for Terraform files. Enabled when `terraform` is on PATH.
 * @type {Object}
 */
export const terraform = {
  name: "terraform",
  extensions: [".tf", ".tfvars"],
  async enabled() {
    const match = which("terraform");
    if (!match) return false;
    return [match, "fmt", "$FILE"];
  }
};
/**
 * latexindent formatter for LaTeX files. Enabled when `latexindent` is on PATH.
 * @type {Object}
 */
export const latexindent = {
  name: "latexindent",
  extensions: [".tex"],
  async enabled() {
    const match = which("latexindent");
    if (!match) return false;
    return [match, "-w", "-s", "$FILE"];
  }
};
/**
 * gleam formatter for Gleam files. Enabled when `gleam` is on PATH.
 * @type {Object}
 */
export const gleam = {
  name: "gleam",
  extensions: [".gleam"],
  async enabled() {
    const match = which("gleam");
    if (!match) return false;
    return [match, "format", "$FILE"];
  }
};
/**
 * shfmt formatter for shell scripts. Enabled when `shfmt` is on PATH.
 * @type {Object}
 */
export const shfmt = {
  name: "shfmt",
  extensions: [".sh", ".bash"],
  async enabled() {
    const match = which("shfmt");
    if (!match) return false;
    return [match, "-w", "$FILE"];
  }
};
/**
 * nixfmt formatter for Nix files. Enabled when `nixfmt` is on PATH.
 * @type {Object}
 */
export const nixfmt = {
  name: "nixfmt",
  extensions: [".nix"],
  async enabled() {
    const match = which("nixfmt");
    if (!match) return false;
    return [match, "$FILE"];
  }
};
/**
 * rustfmt formatter for Rust files. Enabled when `rustfmt` is on PATH.
 * @type {Object}
 */
export const rustfmt = {
  name: "rustfmt",
  extensions: [".rs"],
  async enabled() {
    const match = which("rustfmt");
    if (!match) return false;
    return [match, "$FILE"];
  }
};
/**
 * Laravel Pint formatter for PHP files.
 * `enabled(context)` requires laravel/pint listed in a composer.json up the tree.
 * @type {Object}
 */
export const pint = {
  name: "pint",
  extensions: [".php"],
  async enabled(context) {
    const items = await Filesystem.findUp("composer.json", context.directory, context.worktree);
    for (const item of items) {
      const json = await Filesystem.readJson(item);
      if (json.require?.["laravel/pint"] || json["require-dev"]?.["laravel/pint"]) return ["./vendor/bin/pint", "$FILE"];
    }
    return false;
  }
};
/**
 * ormolu formatter for Haskell files. Enabled when `ormolu` is on PATH.
 * @type {Object}
 */
export const ormolu = {
  name: "ormolu",
  extensions: [".hs"],
  async enabled() {
    const match = which("ormolu");
    if (!match) return false;
    return [match, "-i", "$FILE"];
  }
};
/**
 * cljfmt formatter for Clojure files. Enabled when `cljfmt` is on PATH.
 * @type {Object}
 */
export const cljfmt = {
  name: "cljfmt",
  extensions: [".clj", ".cljs", ".cljc", ".edn"],
  async enabled() {
    const match = which("cljfmt");
    if (!match) return false;
    return [match, "fix", "--quiet", "$FILE"];
  }
};
/**
 * dfmt formatter for D files. Enabled when `dfmt` is on PATH.
 * @type {Object}
 */
export const dfmt = {
  name: "dfmt",
  extensions: [".d"],
  async enabled() {
    const match = which("dfmt");
    if (!match) return false;
    return [match, "-i", "$FILE"];
  }
};