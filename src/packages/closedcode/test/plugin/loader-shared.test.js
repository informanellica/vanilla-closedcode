import {  Effect, Layer  } from "effect"
import {  disposeAllInstances, provideInstance, tmpdir  } from "../fixture/fixture.js"
import {  Filesystem  } from "@/util/filesystem.js"
import {  afterAll, afterEach, describe, expect, test, beforeAll, jest  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import {  pathToFileURL  } from "url"
import { readJson, readText, writeFile } from "../lib/io.js";

const disableDefault = process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS;
process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS = "1";
const {
  Plugin
} = await import("../../src/plugin/index.js");
const {
  PluginLoader
} = await import("../../src/plugin/loader.js");
const {
  readPackageThemes
} = await import("../../src/plugin/shared.js");
const {
  Bus
} = await import("../../src/bus/index.js");
const {
  Npm
} = await import("core/npm");
const {
  TestConfig
} = await import("../fixture/config.js");
function mockNpmAdd(impl) {
  const previous = globalThis.__closedcodeTestNpmAdd;
  const mock = jest.fn(impl);
  globalThis.__closedcodeTestNpmAdd = mock;
  mock.mockRestore = () => {
    if (previous === undefined) {
      delete globalThis.__closedcodeTestNpmAdd;
      return;
    }
    globalThis.__closedcodeTestNpmAdd = previous;
  };
  return mock;
}
afterAll(() => {
  if (disableDefault === undefined) {
    delete process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS;
    return;
  }
  process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS = disableDefault;
});
afterEach(async () => {
  await disposeAllInstances();
});
async function load(dir) {
  const source = path.join(dir, "opencode.json");
  const config = await readJson(source);
  const plugins = config.plugin ?? [];
  return Effect.gen(function* () {
    const plugin = yield* Plugin.Service;
    yield* plugin.list();
  }).pipe(Effect.provide(Plugin.layer.pipe(Layer.provide(Bus.layer), Layer.provide(TestConfig.layer({
    get: () => Effect.succeed({
      plugin: plugins,
      plugin_origins: plugins.map(plugin => ({
        spec: plugin,
        source,
        scope: "local"
      }))
    }),
    directories: () => Effect.succeed([dir])
  })))), provideInstance(dir), Effect.runPromise);
}
describe("plugin.loader.shared", () => {
  test("loads a file:// plugin function export", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const mark = path.join(dir, "called.txt");
        await writeFile(file, ["export default async () => {", `  await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "  return {}", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await fs.readFile(tmp.extra.mark, "utf8")).toBe("called");
  });
  test("deduplicates same function exported as default and named", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const mark = path.join(dir, "count.txt");
        await writeFile(mark, "");
        await writeFile(file, ["const run = async () => {", `  const text = await (await import("node:fs/promises")).readFile(${JSON.stringify(mark)}, "utf8").catch(() => "")`, `  await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, text + "1")`, "  return {}", "}", "export default run", "export const named = run", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await fs.readFile(tmp.extra.mark, "utf8")).toBe("1");
  });
  test("uses only default v1 server plugin when present", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const mark = path.join(dir, "count.txt");
        await writeFile(file, ["export default {", '  id: "demo.v1-default",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "default")`, "    return {}", "  },", "}", "export const named = async () => {", `  await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "named")`, "  return {}", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await readText(tmp.extra.mark)).toBe("default");
  });
  test("rejects v1 file server plugin without id", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const mark = path.join(dir, "called.txt");
        await writeFile(file, ["export default {", "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    const called = await readText(tmp.extra.mark).then(() => true).catch(() => false);
    expect(called).toBe(false);
  });
  test("rejects v1 plugin that exports server and tui together", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const mark = path.join(dir, "called.txt");
        await writeFile(file, ["export default {", '  id: "demo.mixed",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "server")`, "    return {}", "  },", "  tui: async () => {},", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    const called = await readText(tmp.extra.mark).then(() => true).catch(() => false);
    expect(called).toBe(false);
  });
  test("resolves npm plugin specs with explicit and default versions", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const acme = path.join(dir, "node_modules", "acme-plugin");
        const scope = path.join(dir, "node_modules", "scope-plugin");
        await fs.mkdir(acme, {
          recursive: true
        });
        await fs.mkdir(scope, {
          recursive: true
        });
        await writeFile(path.join(acme, "package.json"), JSON.stringify({
          name: "acme-plugin",
          type: "module",
          main: "./index.js"
        }, null, 2));
        await writeFile(path.join(acme, "index.js"), "export default { server: async () => ({}) }\n");
        await writeFile(path.join(scope, "package.json"), JSON.stringify({
          name: "scope-plugin",
          type: "module",
          main: "./index.js"
        }, null, 2));
        await writeFile(path.join(scope, "index.js"), "export default { server: async () => ({}) }\n");
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["acme-plugin", "scope-plugin@2.3.4"]
        }, null, 2));
        return {
          acme,
          scope
        };
      }
    });
    const add = mockNpmAdd(async pkg => {
      if (pkg === "acme-plugin") return {
        directory: tmp.extra.acme,
        entrypoint: undefined
      };
      return {
        directory: tmp.extra.scope,
        entrypoint: undefined
      };
    });
    try {
      await load(tmp.path);
      expect(add.mock.calls).toContainEqual(["acme-plugin@latest"]);
      expect(add.mock.calls).toContainEqual(["scope-plugin@2.3.4"]);
    } finally {
      add.mockRestore();
    }
  });
  test("loads npm server plugin from package ./server export", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        const mark = path.join(dir, "server-called.txt");
        await fs.mkdir(mod, {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          type: "module",
          exports: {
            ".": "./index.js",
            "./server": "./server.js",
            "./tui": "./tui.js"
          }
        }, null, 2));
        await writeFile(path.join(mod, "index.js"), 'import "./main-throws.js"\nexport default {}\n');
        await writeFile(path.join(mod, "main-throws.js"), 'throw new Error("main loaded")\n');
        await writeFile(path.join(mod, "server.js"), ["export default {", "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(mod, "tui.js"), "export default {}\n");
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["acme-plugin@1.0.0"]
        }, null, 2));
        return {
          mod,
          mark
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    try {
      await load(tmp.path);
      expect(await readText(tmp.extra.mark)).toBe("called");
    } finally {
      install.mockRestore();
    }
  });
  test("loads npm server plugin from package server export without leading dot", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        const dist = path.join(mod, "dist");
        const mark = path.join(dir, "server-called.txt");
        await fs.mkdir(dist, {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          type: "module",
          exports: {
            ".": "./index.js",
            "./server": "dist/server.js"
          }
        }, null, 2));
        await writeFile(path.join(mod, "index.js"), 'import "./main-throws.js"\nexport default {}\n');
        await writeFile(path.join(mod, "main-throws.js"), 'throw new Error("main loaded")\n');
        await writeFile(path.join(dist, "server.js"), ["export default {", "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["acme-plugin@1.0.0"]
        }, null, 2));
        return {
          mod,
          mark
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    try {
      await load(tmp.path);
      expect(await readText(tmp.extra.mark)).toBe("called");
    } finally {
      install.mockRestore();
    }
  });
  test("loads npm server plugin from package main without leading dot", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        const dist = path.join(mod, "dist");
        const mark = path.join(dir, "main-called.txt");
        await fs.mkdir(dist, {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          type: "module",
          main: "dist/index.js"
        }, null, 2));
        await writeFile(path.join(dist, "index.js"), ["export default {", "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["acme-plugin@1.0.0"]
        }, null, 2));
        return {
          mod,
          mark
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    try {
      await load(tmp.path);
      expect(await readText(tmp.extra.mark)).toBe("called");
    } finally {
      install.mockRestore();
    }
  });
  test("does not use npm package exports dot for server entry", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        const mark = path.join(dir, "dot-server.txt");
        await fs.mkdir(mod, {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          type: "module",
          exports: {
            ".": "./index.js"
          }
        }));
        await writeFile(path.join(mod, "index.js"), ["export default {", '  id: "demo.dot.server",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["acme-plugin@1.0.0"]
        }, null, 2));
        return {
          mod,
          mark
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    try {
      await load(tmp.path);
      const called = await readText(tmp.extra.mark).then(() => true).catch(() => false);
      expect(called).toBe(false);
    } finally {
      install.mockRestore();
    }
  });
  test("rejects npm server export that resolves outside plugin directory", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        const outside = path.join(dir, "outside");
        const mark = path.join(dir, "outside-server.txt");
        await fs.mkdir(mod, {
          recursive: true
        });
        await fs.mkdir(outside, {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          type: "module",
          exports: {
            ".": "./index.js",
            "./server": "./escape/server.js"
          }
        }, null, 2));
        await writeFile(path.join(mod, "index.js"), "export default {}\n");
        await writeFile(path.join(outside, "server.js"), ["export default {", "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "outside")`, "    return {}", "  },", "}", ""].join("\n"));
        await fs.symlink(outside, path.join(mod, "escape"), process.platform === "win32" ? "junction" : "dir");
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["acme-plugin"]
        }, null, 2));
        return {
          mod,
          mark
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    try {
      await load(tmp.path);
      const called = await readText(tmp.extra.mark).then(() => true).catch(() => false);
      expect(called).toBe(false);
    } finally {
      install.mockRestore();
    }
  });
  test("skips legacy codex and copilot auth plugin specs", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["opencode-openai-codex-auth@1.0.0", "opencode-copilot-auth@1.0.0", "regular-plugin@1.0.0"]
        }, null, 2));
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: "",
      entrypoint: undefined
    }));
    try {
      await load(tmp.path);
      const pkgs = install.mock.calls.map(call => call[0]);
      expect(pkgs).toContain("regular-plugin@1.0.0");
      expect(pkgs).not.toContain("opencode-openai-codex-auth@1.0.0");
      expect(pkgs).not.toContain("opencode-copilot-auth@1.0.0");
    } finally {
      install.mockRestore();
    }
  });
  test("skips broken plugin when install fails", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const ok = path.join(dir, "ok.mjs");
        const mark = path.join(dir, "ok.txt");
        await writeFile(ok, ["export default {", '  id: "demo.ok",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "ok")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: ["broken-plugin@9.9.9", pathToFileURL(ok).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    const install = mockNpmAdd(async () => { throw new Error("boom") });
    try {
      await load(tmp.path);
      expect(install).toHaveBeenCalledWith("broken-plugin@9.9.9");
      expect(await readText(tmp.extra.mark)).toBe("ok");
    } finally {
      install.mockRestore();
    }
  });
  test("continues loading plugins when plugin init throws", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = pathToFileURL(path.join(dir, "throws.mjs")).href;
        const ok = pathToFileURL(path.join(dir, "ok.mjs")).href;
        const mark = path.join(dir, "ok.txt");
        await writeFile(path.join(dir, "throws.mjs"), ["export default {", '  id: "demo.throws",', "  server: async () => {", '    throw new Error("explode")', "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "ok.mjs"), ["export default {", '  id: "demo.ok",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "ok")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [file, ok]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await readText(tmp.extra.mark)).toBe("ok");
  });
  test("continues loading plugins when plugin module has invalid export", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = pathToFileURL(path.join(dir, "invalid.mjs")).href;
        const ok = pathToFileURL(path.join(dir, "ok.mjs")).href;
        const mark = path.join(dir, "ok.txt");
        await writeFile(path.join(dir, "invalid.mjs"), ["export default {", '  id: "demo.invalid",', "  nope: true,", "}", ""].join("\n"));
        await writeFile(path.join(dir, "ok.mjs"), ["export default {", '  id: "demo.ok",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "ok")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [file, ok]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await readText(tmp.extra.mark)).toBe("ok");
  });
  test("continues loading plugins when plugin import fails", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const missing = pathToFileURL(path.join(dir, "missing-plugin.mjs")).href;
        const ok = pathToFileURL(path.join(dir, "ok.mjs")).href;
        const mark = path.join(dir, "ok.txt");
        await writeFile(path.join(dir, "ok.mjs"), ["export default {", '  id: "demo.ok",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "ok")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [missing, ok]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await readText(tmp.extra.mark)).toBe("ok");
  });
  test("loads object plugin via plugin.server", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "object-plugin.mjs");
        const mark = path.join(dir, "object-called.txt");
        await writeFile(file, ["const plugin = {", '  id: "demo.object",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", "export default plugin", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await fs.readFile(tmp.extra.mark, "utf8")).toBe("called");
  });
  test("passes tuple plugin options into server plugin", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "options-plugin.mjs");
        const mark = path.join(dir, "options.json");
        await writeFile(file, ["const plugin = {", '  id: "demo.options",', "  server: async (_input, options) => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, JSON.stringify(options ?? null))`, "    return {}", "  },", "}", "export default plugin", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [[pathToFileURL(file).href, {
            source: "tuple",
            enabled: true
          }]]
        }, null, 2));
        return {
          mark
        };
      }
    });
    await load(tmp.path);
    expect(await Filesystem.readJson(tmp.extra.mark)).toEqual({
      source: "tuple",
      enabled: true
    });
  });
  test("initializes server plugins in config order", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const a = path.join(dir, "a-plugin.mjs");
        const b = path.join(dir, "b-plugin.mjs");
        const marker = path.join(dir, "server-order.txt");
        const aSpec = pathToFileURL(a).href;
        const bSpec = pathToFileURL(b).href;
        await writeFile(a, `import fs from "fs/promises"

export default {
  id: "demo.order.a",
  server: async () => {
    await fs.appendFile(${JSON.stringify(marker)}, "a-start\\n")
    await new Promise((r) => setTimeout(r, 25))
    await fs.appendFile(${JSON.stringify(marker)}, "a-end\\n")
    return {}
  },
}
`);
        await writeFile(b, `import fs from "fs/promises"

export default {
  id: "demo.order.b",
  server: async () => {
    await fs.appendFile(${JSON.stringify(marker)}, "b\\n")
    return {}
  },
}
`);
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [aSpec, bSpec]
        }, null, 2));
        return {
          marker
        };
      }
    });
    await load(tmp.path);
    const lines = (await fs.readFile(tmp.extra.marker, "utf8")).trim().split("\n");
    expect(lines).toEqual(["a-start", "a-end", "b"]);
  });
  test("skips external plugins in pure mode", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const mark = path.join(dir, "called.txt");
        await writeFile(file, ["export default {", '  id: "demo.pure",', "  server: async () => {", `    await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, "called")`, "    return {}", "  },", "}", ""].join("\n"));
        await writeFile(path.join(dir, "opencode.json"), JSON.stringify({
          plugin: [pathToFileURL(file).href]
        }, null, 2));
        return {
          mark
        };
      }
    });
    const pure = process.env.CLOSEDCODE_PURE;
    process.env.CLOSEDCODE_PURE = "1";
    try {
      await load(tmp.path);
      const called = await fs.readFile(tmp.extra.mark, "utf8").then(() => true).catch(() => false);
      expect(called).toBe(false);
    } finally {
      if (pure === undefined) {
        delete process.env.CLOSEDCODE_PURE;
      } else {
        process.env.CLOSEDCODE_PURE = pure;
      }
    }
  });
  test("reads oc-themes from package manifest", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mod");
        await fs.mkdir(path.join(mod, "themes"), {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          version: "1.0.0",
          "oc-themes": ["themes/one.json", "./themes/one.json", "themes/two.json"]
        }, null, 2));
        return {
          mod
        };
      }
    });
    const file = path.join(tmp.extra.mod, "package.json");
    const json = await Filesystem.readJson(file);
    const list = readPackageThemes("acme-plugin", {
      dir: tmp.extra.mod,
      pkg: file,
      json
    });
    expect(list).toEqual([Filesystem.resolve(path.join(tmp.extra.mod, "themes", "one.json")), Filesystem.resolve(path.join(tmp.extra.mod, "themes", "two.json"))]);
  });
  test("handles no-entrypoint tui packages via missing callback", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        await fs.mkdir(path.join(mod, "themes"), {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          version: "1.0.0",
          "oc-themes": ["themes/night.json"]
        }, null, 2));
        await writeFile(path.join(mod, "themes", "night.json"), "{}\n");
        return {
          mod
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    const missing = [];
    try {
      const loaded = await PluginLoader.loadExternal({
        items: [{
          spec: "acme-plugin@1.0.0",
          scope: "local",
          source: tmp.path
        }],
        kind: "tui",
        missing: async item => {
          if (!item.pkg) return;
          const themes = readPackageThemes(item.spec, item.pkg);
          if (!themes.length) return;
          return {
            spec: item.spec,
            target: item.target,
            themes
          };
        },
        report: {
          missing(_candidate, _retry, message) {
            missing.push(message);
          }
        }
      });
      expect(loaded).toEqual([{
        spec: "acme-plugin@1.0.0",
        target: tmp.extra.mod,
        themes: [Filesystem.resolve(path.join(tmp.extra.mod, "themes", "night.json"))]
      }]);
      expect(missing).toHaveLength(0);
    } finally {
      install.mockRestore();
    }
  });
  test("passes package metadata for entrypoint tui plugins", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mods", "acme-plugin");
        await fs.mkdir(path.join(mod, "themes"), {
          recursive: true
        });
        await writeFile(path.join(mod, "package.json"), JSON.stringify({
          name: "acme-plugin",
          version: "1.0.0",
          exports: {
            "./tui": "./tui.mjs"
          },
          "oc-themes": ["themes/night.json"]
        }, null, 2));
        await writeFile(path.join(mod, "tui.mjs"), 'export default { id: "demo", tui: async () => {} }\n');
        await writeFile(path.join(mod, "themes", "night.json"), "{}\n");
        return {
          mod
        };
      }
    });
    const install = mockNpmAdd(async () => ({
      directory: tmp.extra.mod,
      entrypoint: undefined
    }));
    try {
      const loaded = await PluginLoader.loadExternal({
        items: [{
          spec: "acme-plugin@1.0.0",
          scope: "local",
          source: tmp.path
        }],
        kind: "tui",
        finish: async item => {
          if (!item.pkg) return;
          return {
            spec: item.spec,
            themes: readPackageThemes(item.spec, item.pkg)
          };
        }
      });
      expect(loaded).toEqual([{
        spec: "acme-plugin@1.0.0",
        themes: [Filesystem.resolve(path.join(tmp.extra.mod, "themes", "night.json"))]
      }]);
    } finally {
      install.mockRestore();
    }
  });
  test("rejects oc-themes path traversal", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "mod");
        await fs.mkdir(mod, {
          recursive: true
        });
        const file = path.join(mod, "package.json");
        await writeFile(file, JSON.stringify({
          name: "acme",
          "oc-themes": ["../escape.json"]
        }, null, 2));
        return {
          mod,
          file
        };
      }
    });
    const json = await Filesystem.readJson(tmp.extra.file);
    expect(() => readPackageThemes("acme", {
      dir: tmp.extra.mod,
      pkg: tmp.extra.file,
      json
    })).toThrow("outside plugin directory");
  });
  test("retries failed file plugins once after wait and keeps order", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const a = path.join(dir, "a");
        const b = path.join(dir, "b");
        const aSpec = pathToFileURL(a).href;
        const bSpec = pathToFileURL(b).href;
        await fs.mkdir(a, {
          recursive: true
        });
        await fs.mkdir(b, {
          recursive: true
        });
        return {
          a,
          b,
          aSpec,
          bSpec
        };
      }
    });
    let wait = 0;
    const calls = [];
    const loaded = await PluginLoader.loadExternal({
      items: [tmp.extra.aSpec, tmp.extra.bSpec].map(spec => ({
        spec,
        scope: "local",
        source: tmp.path
      })),
      kind: "tui",
      wait: async () => {
        wait += 1;
        await writeFile(path.join(tmp.extra.a, "index.mjs"), "export default {}\n");
        await writeFile(path.join(tmp.extra.b, "index.mjs"), "export default {}\n");
      },
      report: {
        start(candidate, retry) {
          calls.push([candidate.plan.spec, retry]);
        }
      }
    });
    expect(wait).toBe(1);
    expect(calls).toEqual([[tmp.extra.aSpec, false], [tmp.extra.bSpec, false], [tmp.extra.aSpec, true], [tmp.extra.bSpec, true]]);
    expect(loaded.map(item => item.spec)).toEqual([tmp.extra.aSpec, tmp.extra.bSpec]);
  });
  test("retries file plugins when finish returns undefined", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.mjs");
        const spec = pathToFileURL(file).href;
        await writeFile(file, "export default {}\n");
        return {
          spec
        };
      }
    });
    let wait = 0;
    let count = 0;
    const loaded = await PluginLoader.loadExternal({
      items: [{
        spec: tmp.extra.spec,
        scope: "local",
        source: tmp.path
      }],
      kind: "tui",
      wait: async () => {
        wait += 1;
      },
      finish: async (load, _item, retry) => {
        count += 1;
        if (!retry) return;
        return {
          retry,
          spec: load.spec
        };
      }
    });
    expect(wait).toBe(1);
    expect(count).toBe(2);
    expect(loaded).toEqual([{
      retry: true,
      spec: tmp.extra.spec
    }]);
  });
  test("does not wait or retry npm plugin failures", async () => {
    const install = mockNpmAdd(async () => { throw new Error("boom") });
    let wait = 0;
    const errors = [];
    try {
      const loaded = await PluginLoader.loadExternal({
        items: [{
          spec: "acme-plugin@1.0.0",
          scope: "local",
          source: "test"
        }],
        kind: "tui",
        wait: async () => {
          wait += 1;
        },
        report: {
          error(_candidate, retry, stage) {
            errors.push([stage, retry]);
          }
        }
      });
      expect(loaded).toEqual([]);
      expect(wait).toBe(0);
      expect(errors).toEqual([["install", false]]);
    } finally {
      install.mockRestore();
    }
  });
});
