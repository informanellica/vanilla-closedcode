import {  FileIgnore  } from "../../src/file/ignore.js"
import {  test, expect, beforeAll  } from "@jest/globals"
test("match nested and non-nested", () => {
  expect(FileIgnore.match("node_modules/index.js")).toBe(true);
  expect(FileIgnore.match("node_modules")).toBe(true);
  expect(FileIgnore.match("node_modules/")).toBe(true);
  expect(FileIgnore.match("node_modules/bar")).toBe(true);
  expect(FileIgnore.match("node_modules/bar/")).toBe(true);
});