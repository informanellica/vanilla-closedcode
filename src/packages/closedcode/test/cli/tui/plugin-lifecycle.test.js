import {  tmpdir  } from "../../fixture/fixture.js"
import {  createTuiPluginApi  } from "../../fixture/tui-plugin.js"
import {  mockTuiRuntime  } from "../../fixture/tui-runtime.js"
import {  expect, test, beforeAll, jest  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import {  pathToFileURL  } from "url"
import { writeFile } from "../../lib/io.js";

const {
  TuiPluginRuntime
} = await import("../../../src/cli/cmd/tui/plugin/runtime.js");
test("runs onDispose callbacks with aborted signal and is idempotent", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "marker.txt");
      await writeFile(file, `export default {
  id: "demo.lifecycle",
  tui: async (api, options) => {
    api.event.on("event.test", () => {})
    api.route.register([{ name: "lifecycle.route", render: () => null }])
    api.lifecycle.onDispose(async () => {
      const prev = await (await import("node:fs/promises")).readFile(options.marker, "utf8").catch(() => "")
      await (await import("node:fs/promises")).writeFile(options.marker, prev + "custom\\n")
    })
    api.lifecycle.onDispose(async () => {
      const prev = await (await import("node:fs/promises")).readFile(options.marker, "utf8").catch(() => "")
      await (await import("node:fs/promises")).writeFile(options.marker, prev + "aborted:" + String(api.lifecycle.signal.aborted) + "\\n")
    })
  },
}
`);
      return {
        spec,
        marker
      };
    }
  });
  const {
    config,
    restore
  } = mockTuiRuntime(tmp.path, [[tmp.extra.spec, {
    marker: tmp.extra.marker
  }]]);
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    await TuiPluginRuntime.dispose();
    const marker = await fs.readFile(tmp.extra.marker, "utf8");
    expect(marker).toContain("custom");
    expect(marker).toContain("aborted:true");

    // second dispose is a no-op
    await TuiPluginRuntime.dispose();
    const after = await fs.readFile(tmp.extra.marker, "utf8");
    expect(after).toBe(marker);
  } finally {
    await TuiPluginRuntime.dispose();
    restore();
  }
});
test("rolls back failed plugin and continues loading next", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const bad = path.join(dir, "bad-plugin.js");
      const good = path.join(dir, "good-plugin.js");
      const badSpec = pathToFileURL(bad).href;
      const goodSpec = pathToFileURL(good).href;
      const badMarker = path.join(dir, "bad-cleanup.txt");
      const goodMarker = path.join(dir, "good-called.txt");
      await writeFile(bad, `export default {
  id: "demo.bad",
  tui: async (api, options) => {
    api.route.register([{ name: "bad.route", render: () => null }])
    api.lifecycle.onDispose(async () => {
      await (await import("node:fs/promises")).writeFile(options.bad_marker, "cleaned")
    })
    throw new Error("bad plugin")
  },
}
`);
      await writeFile(good, `export default {
  id: "demo.good",
  tui: async (_api, options) => {
    await (await import("node:fs/promises")).writeFile(options.good_marker, "called")
  },
}
`);
      return {
        badSpec,
        goodSpec,
        badMarker,
        goodMarker
      };
    }
  });
  const {
    config,
    restore
  } = mockTuiRuntime(tmp.path, [[tmp.extra.badSpec, {
    bad_marker: tmp.extra.badMarker
  }], [tmp.extra.goodSpec, {
    good_marker: tmp.extra.goodMarker
  }]]);
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    // bad plugin's onDispose ran during rollback
    await expect(fs.readFile(tmp.extra.badMarker, "utf8")).resolves.toBe("cleaned");
    // good plugin still loaded
    await expect(fs.readFile(tmp.extra.goodMarker, "utf8")).resolves.toBe("called");
  } finally {
    await TuiPluginRuntime.dispose();
    restore();
  }
});
test("assigns sequential slot ids scoped to plugin", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "slot-plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "slot-setup.txt");
      await writeFile(file, `import fs from "fs"

const mark = (label) => {
  fs.appendFileSync(${JSON.stringify(marker)}, label + "\\n")
}

export default {
  id: "demo.slot",
  tui: async (api) => {
    const one = api.slots.register({
      id: 1,
      setup: () => { mark("one") },
      slots: { home_logo() { return null } },
    })
    const two = api.slots.register({
      id: 2,
      setup: () => { mark("two") },
      slots: { home_bottom() { return null } },
    })
    mark("id:" + one)
    mark("id:" + two)
  },
}
`);
      return {
        spec,
        marker
      };
    }
  });
  const {
    config,
    restore
  } = mockTuiRuntime(tmp.path, [tmp.extra.spec]);
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    const marker = await fs.readFile(tmp.extra.marker, "utf8");
    expect(marker).toContain("one");
    expect(marker).toContain("two");
    expect(marker).toContain("id:demo.slot");
    expect(marker).toContain("id:demo.slot:1");

    // no initialization failures
    const hit = err.mock.calls.find(item => typeof item[0] === "string" && item[0].includes("failed to initialize tui plugin"));
    expect(hit).toBeUndefined();
  } finally {
    await TuiPluginRuntime.dispose();
    err.mockRestore();
    restore();
  }
});
test("times out hanging plugin cleanup on dispose", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "timeout-plugin.js");
      const spec = pathToFileURL(file).href;
      await writeFile(file, `export default {
  id: "demo.timeout",
  tui: async (api) => {
    api.lifecycle.onDispose(() => new Promise(() => {}))
  },
}
`);
      return {
        spec
      };
    }
  });
  const {
    config,
    restore
  } = mockTuiRuntime(tmp.path, [tmp.extra.spec]);
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    const done = await new Promise(resolve => {
      const timer = setTimeout(() => resolve("timeout"), 7000);
      void TuiPluginRuntime.dispose().then(() => {
        clearTimeout(timer);
        resolve("done");
      });
    });
    expect(done).toBe("done");
  } finally {
    await TuiPluginRuntime.dispose();
    restore();
  }
}, 15000);