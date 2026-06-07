import { describe, expect, test } from "@jest/globals";
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const html = async name => readFile(join(dir, name), "utf8");

describe("electron renderer html", () => {
  for (const name of ["index.html", "loading.html"]) {
    describe(name, () => {
      test("script src attributes use relative paths", async () => {
        const content = await html(name);
        const srcs = [...content.matchAll(/\bsrc=["']([^"']+)["']/g)].map(m => m[1]);
        for (const src of srcs) {
          expect(src).not.toMatch(/^\/[^/]/);
        }
      });
      test("link href attributes use relative paths", async () => {
        const content = await html(name);
        const hrefs = [...content.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map(m => m[1]);
        for (const href of hrefs) {
          expect(href).not.toMatch(/^\/[^/]/);
        }
      });
      test("no web manifest link (not applicable in Electron)", async () => {
        const content = await html(name);
        expect(content).not.toContain('rel="manifest"');
      });
    });
  }
});