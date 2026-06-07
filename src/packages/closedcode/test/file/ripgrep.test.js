import {  Effect  } from "effect"
import * as Stream from "effect/Stream";
import {  tmpdir  } from "../fixture/fixture.js"
import {  Ripgrep  } from "../../src/file/ripgrep.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import { writeFile } from "../lib/io.js";

const run = effect => effect.pipe(Effect.provide(Ripgrep.defaultLayer), Effect.runPromise);
describe("file.ripgrep", () => {
  test("defaults to include hidden", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "visible.txt"), "hello");
        await fs.mkdir(path.join(dir, ".opencode"), {
          recursive: true
        });
        await writeFile(path.join(dir, ".opencode", "thing.json"), "{}");
      }
    });
    const files = await run(Ripgrep.Service.use(rg => rg.files({
      cwd: tmp.path
    }).pipe(Stream.runCollect, Effect.map(c => [...c]))));
    expect(files.includes("visible.txt")).toBe(true);
    expect(files.includes(path.join(".opencode", "thing.json"))).toBe(true);
  });
  test("hidden false excludes hidden", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "visible.txt"), "hello");
        await fs.mkdir(path.join(dir, ".opencode"), {
          recursive: true
        });
        await writeFile(path.join(dir, ".opencode", "thing.json"), "{}");
      }
    });
    const files = await run(Ripgrep.Service.use(rg => rg.files({
      cwd: tmp.path,
      hidden: false
    }).pipe(Stream.runCollect, Effect.map(c => [...c]))));
    expect(files.includes("visible.txt")).toBe(true);
    expect(files.includes(path.join(".opencode", "thing.json"))).toBe(false);
  });
  test("search returns empty when nothing matches", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "match.ts"), "const value = 'other'\n");
      }
    });
    const result = await run(Ripgrep.Service.use(rg => rg.search({
      cwd: tmp.path,
      pattern: "needle"
    })));
    expect(result.partial).toBe(false);
    expect(result.items).toEqual([]);
  });
  test("search returns match metadata with normalized path", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await fs.mkdir(path.join(dir, "src"), {
          recursive: true
        });
        await writeFile(path.join(dir, "src", "match.ts"), "const needle = 1\n");
      }
    });
    const result = await run(Ripgrep.Service.use(rg => rg.search({
      cwd: tmp.path,
      pattern: "needle"
    })));
    expect(result.partial).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.path.text).toBe(path.join("src", "match.ts"));
    expect(result.items[0]?.line_number).toBe(1);
    expect(result.items[0]?.lines.text).toContain("needle");
  });
  test("search returns matched rows with glob filter", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "match.ts"), "const value = 'needle'\n");
        await writeFile(path.join(dir, "skip.txt"), "const value = 'other'\n");
      }
    });
    const result = await run(Ripgrep.Service.use(rg => rg.search({
      cwd: tmp.path,
      pattern: "needle",
      glob: ["*.ts"]
    })));
    expect(result.partial).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.path.text).toContain("match.ts");
    expect(result.items[0]?.lines.text).toContain("needle");
  });
  test("search supports explicit file targets", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "match.ts"), "const value = 'needle'\n");
        await writeFile(path.join(dir, "skip.ts"), "const value = 'needle'\n");
      }
    });
    const file = path.join(tmp.path, "match.ts");
    const result = await run(Ripgrep.Service.use(rg => rg.search({
      cwd: tmp.path,
      pattern: "needle",
      file: [file]
    })));
    expect(result.partial).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.path.text).toBe(file);
  });
  test("files returns empty when glob matches no files", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await fs.mkdir(path.join(dir, "packages", "console"), {
          recursive: true
        });
        await writeFile(path.join(dir, "packages", "console", "package.json"), "{}");
      }
    });
    const files = await run(Ripgrep.Service.use(rg => rg.files({
      cwd: tmp.path,
      glob: ["packages/*"]
    }).pipe(Stream.runCollect, Effect.map(c => [...c]))));
    expect(files).toEqual([]);
  });
  test("files returns stream of filenames", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "a.txt"), "hello");
        await writeFile(path.join(dir, "b.txt"), "world");
      }
    });
    const files = await run(Ripgrep.Service.use(rg => rg.files({
      cwd: tmp.path
    }).pipe(Stream.runCollect, Effect.map(c => [...c].sort()))));
    expect(files).toEqual(["a.txt", "b.txt"]);
  });
  test("files respects glob filter", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "keep.ts"), "yes");
        await writeFile(path.join(dir, "skip.txt"), "no");
      }
    });
    const files = await run(Ripgrep.Service.use(rg => rg.files({
      cwd: tmp.path,
      glob: ["*.ts"]
    }).pipe(Stream.runCollect, Effect.map(c => [...c]))));
    expect(files).toEqual(["keep.ts"]);
  });
  test("files dies on nonexistent directory", async () => {
    const exit = await Ripgrep.Service.use(rg => rg.files({
      cwd: "/tmp/nonexistent-dir-12345"
    }).pipe(Stream.runCollect)).pipe(Effect.provide(Ripgrep.defaultLayer), Effect.runPromiseExit);
    expect(exit._tag).toBe("Failure");
  });
  test("ignores RIPGREP_CONFIG_PATH in direct mode", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "match.ts"), "const needle = 1\n");
      }
    });
    const prev = process.env["RIPGREP_CONFIG_PATH"];
    process.env["RIPGREP_CONFIG_PATH"] = path.join(tmp.path, "missing-ripgreprc");
    try {
      const result = await run(Ripgrep.Service.use(rg => rg.search({
        cwd: tmp.path,
        pattern: "needle"
      })));
      expect(result.items).toHaveLength(1);
    } finally {
      if (prev === undefined) delete process.env["RIPGREP_CONFIG_PATH"];else process.env["RIPGREP_CONFIG_PATH"] = prev;
    }
  });
  test("ignores RIPGREP_CONFIG_PATH in worker mode", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        await writeFile(path.join(dir, "match.ts"), "const needle = 1\n");
      }
    });
    const prev = process.env["RIPGREP_CONFIG_PATH"];
    process.env["RIPGREP_CONFIG_PATH"] = path.join(tmp.path, "missing-ripgreprc");
    try {
      const result = await run(Ripgrep.Service.use(rg => rg.search({
        cwd: tmp.path,
        pattern: "needle"
      })));
      expect(result.items).toHaveLength(1);
    } finally {
      if (prev === undefined) delete process.env["RIPGREP_CONFIG_PATH"];else process.env["RIPGREP_CONFIG_PATH"] = prev;
    }
  });
});