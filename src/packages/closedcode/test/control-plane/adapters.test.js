import {  getAdapter, registerAdapter  } from "../../src/control-plane/adapters/index.js"
import {  ProjectID  } from "../../src/project/schema.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
function info(projectID, type) {
  return {
    id: "workspace-test",
    type,
    name: "workspace-test",
    branch: null,
    directory: null,
    extra: null,
    projectID
  };
}
function adapter(dir) {
  return {
    name: dir,
    description: dir,
    configure(input) {
      return input;
    },
    async create() {},
    async remove() {},
    target() {
      return {
        type: "local",
        directory: dir
      };
    }
  };
}
describe("control-plane/adapters", () => {
  test("isolates custom adapters by project", async () => {
    const type = `demo-${Math.random().toString(36).slice(2)}`;
    const one = ProjectID.make(`project-${Math.random().toString(36).slice(2)}`);
    const two = ProjectID.make(`project-${Math.random().toString(36).slice(2)}`);
    registerAdapter(one, type, adapter("/one"));
    registerAdapter(two, type, adapter("/two"));
    expect(await (await getAdapter(one, type)).target(info(one, type))).toEqual({
      type: "local",
      directory: "/one"
    });
    expect(await (await getAdapter(two, type)).target(info(two, type))).toEqual({
      type: "local",
      directory: "/two"
    });
  });
  test("latest install wins within a project", async () => {
    const type = `demo-${Math.random().toString(36).slice(2)}`;
    const id = ProjectID.make(`project-${Math.random().toString(36).slice(2)}`);
    registerAdapter(id, type, adapter("/one"));
    expect(await (await getAdapter(id, type)).target(info(id, type))).toEqual({
      type: "local",
      directory: "/one"
    });
    registerAdapter(id, type, adapter("/two"));
    expect(await (await getAdapter(id, type)).target(info(id, type))).toEqual({
      type: "local",
      directory: "/two"
    });
  });
});