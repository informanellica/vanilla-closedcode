import {  Effect  } from "effect"
import {  Discovery  } from "../../src/skill/discovery.js"
import {  Global  } from "core/global"
import {  Filesystem  } from "#util/filesystem.js"
import {  describe, test, expect, beforeAll, afterAll  } from "@jest/globals"
import {  rm  } from "fs/promises"
import path from "path";
import { fileURLToPath } from "node:url";
let CLOUDFLARE_SKILLS_URL;
let server;
let downloadCount = 0;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "../fixture/skills");
const cacheDir = path.join(Global.Path.cache, "skills");
beforeAll(async () => {
  await rm(cacheDir, {
    recursive: true,
    force: true});
  const { nodeFetchServer } = await import("../fixture/node-fetch-server.js");
  server = await nodeFetchServer({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      // route /.well-known/skills/* to the fixture directory
      if (url.pathname.startsWith("/.well-known/skills/")) {
        const filePath = url.pathname.replace("/.well-known/skills/", "");
        const fullPath = path.join(fixturePath, filePath);
        if (await Filesystem.exists(fullPath)) {
          if (!fullPath.endsWith("index.json")) {
            downloadCount++;
          }
          const { createReadStream } = await import("node:fs");
          const { Readable } = await import("node:stream");
          return new Response(Readable.toWeb(createReadStream(fullPath)));
        }
      }
      return new Response("Not Found", {
        status: 404
      });
    }
  });
  CLOUDFLARE_SKILLS_URL = `http://localhost:${server.port}/.well-known/skills/`;
});
afterAll(async () => {
  void server?.stop();
  await rm(cacheDir, {
    recursive: true,
    force: true
  });
});
describe("Discovery.pull", () => {
  const pull = url => Effect.runPromise(Discovery.Service.use(s => s.pull(url)).pipe(Effect.provide(Discovery.defaultLayer)));
  test("downloads skills from cloudflare url", async () => {
    const dirs = await pull(CLOUDFLARE_SKILLS_URL);
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(dir.startsWith(cacheDir)).toBe(true);
      const md = path.join(dir, "SKILL.md");
      expect(await Filesystem.exists(md)).toBe(true);
    }
  });
  test("url without trailing slash works", async () => {
    const dirs = await pull(CLOUDFLARE_SKILLS_URL.replace(/\/$/, ""));
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      const md = path.join(dir, "SKILL.md");
      expect(await Filesystem.exists(md)).toBe(true);
    }
  });
  test("returns empty array for invalid url", async () => {
    const dirs = await pull(`http://localhost:${server.port}/invalid-url/`);
    expect(dirs).toEqual([]);
  });
  test("returns empty array for non-json response", async () => {
    // any url not explicitly handled in server returns 404 text "Not Found"
    const dirs = await pull(`http://localhost:${server.port}/some-other-path/`);
    expect(dirs).toEqual([]);
  });
  test("downloads reference files alongside SKILL.md", async () => {
    const dirs = await pull(CLOUDFLARE_SKILLS_URL);
    // find a skill dir that should have reference files (e.g. agents-sdk)
    const agentsSdk = dirs.find(d => d.endsWith(path.sep + "agents-sdk"));
    expect(agentsSdk).toBeDefined();
    if (agentsSdk) {
      const refs = path.join(agentsSdk, "references");
      expect(await Filesystem.exists(path.join(agentsSdk, "SKILL.md"))).toBe(true);
      // agents-sdk has reference files per the index
      const { glob } = await import("glob");
      const refDir = await glob("**/*.md", { cwd: refs, nodir: true });
      expect(refDir.length).toBeGreaterThan(0);
    }
  });
  test("caches downloaded files on second pull", async () => {
    // clear dir and downloadCount
    await rm(cacheDir, {
      recursive: true,
      force: true
    });
    downloadCount = 0;

    // first pull to populate cache
    const first = await pull(CLOUDFLARE_SKILLS_URL);
    expect(first.length).toBeGreaterThan(0);
    const firstCount = downloadCount;
    expect(firstCount).toBeGreaterThan(0);

    // second pull should return same results from cache
    const second = await pull(CLOUDFLARE_SKILLS_URL);
    expect(second.length).toBe(first.length);
    expect(second.sort()).toEqual(first.sort());

    // second pull should NOT increment download count
    expect(downloadCount).toBe(firstCount);
  });
});
