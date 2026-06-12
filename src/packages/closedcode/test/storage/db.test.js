import {  Global  } from "core/global"
import {  InstallationChannel  } from "core/installation/version"
import {  Database  } from "#storage/db.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
describe("Database.Path", () => {
  test("returns closedcode.db canonical path for the current channel", () => {
    const expected = ["latest", "beta"].includes(InstallationChannel) ? path.join(Global.Path.data, "closedcode.db") : path.join(Global.Path.data, `closedcode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`);
    expect(Database.getChannelPath()).toBe(expected);
  });

  test("canonical filename uses closedcode prefix", () => {
    expect(path.basename(Database.getChannelPath())).toMatch(/^closedcode/);
  });
});
