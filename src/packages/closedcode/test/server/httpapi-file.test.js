import {  Context  } from "effect"
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  ExperimentalHttpApiServer  } from "../../src/server/routes/instance/httpapi/server.js"
import {  FilePaths  } from "../../src/server/routes/instance/httpapi/groups/file.js"
import * as Log from "core/util/log";
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
import { writeFile } from "../lib/io.js";

void Log.init({
  print: false
});
const context = Context.empty();
function request(route, directory, query) {
  const url = new URL(`http://localhost${route}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return ExperimentalHttpApiServer.webHandler().handler(new Request(url, {
    headers: {
      "x-opencode-directory": directory
    }
  }), context);
}
afterEach(async () => {
  await disposeAllInstances();
  await resetDatabase();
});
describe("file HttpApi", () => {
  test("serves read endpoints", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await writeFile(path.join(tmp.path, "hello.txt"), "hello");
    const [list, content, status] = await Promise.all([request(FilePaths.list, tmp.path, {
      path: "."
    }), request(FilePaths.content, tmp.path, {
      path: "hello.txt"
    }), request(FilePaths.status, tmp.path)]);
    expect(list.status).toBe(200);
    expect(await list.json()).toContainEqual(expect.objectContaining({
      name: "hello.txt",
      path: "hello.txt",
      type: "file"
    }));
    expect(content.status).toBe(200);
    expect(await content.json()).toMatchObject({
      type: "text",
      content: "hello"
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toContainEqual({
      path: "hello.txt",
      added: 1,
      removed: 0,
      status: "added"
    });
  });
  test("serves search endpoints", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    await writeFile(path.join(tmp.path, "hello.txt"), "needle");
    const [text, files, symbols] = await Promise.all([request(FilePaths.findText, tmp.path, {
      pattern: "needle"
    }), request(FilePaths.findFile, tmp.path, {
      query: "hello",
      type: "file"
    }), request(FilePaths.findSymbol, tmp.path, {
      query: "hello"
    })]);
    expect(text.status).toBe(200);
    expect(await text.json()).toContainEqual(expect.objectContaining({
      line_number: 1
    }));
    expect(files.status).toBe(200);
    expect(await files.json()).toContain("hello.txt");
    expect(symbols.status).toBe(200);
    expect(await symbols.json()).toEqual([]);
  });
});