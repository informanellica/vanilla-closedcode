import {  tmpdir  } from "../fixture/fixture.js"
import {  Session as SessionNs  } from "#session/session.js"
import {  Bus  } from "../../src/bus/index.js"
import * as Log from "core/util/log";
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  MessageV2  } from "../../src/session/message-v2.js"
import {  MessageID, PartID  } from "../../src/session/schema.js"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
import { fileURLToPath as __toPath } from "node:url";
const __dirname = path.dirname(__toPath(import.meta.url));

let SessionNs;

const projectRoot = path.join(__dirname, "../..");
void Log.init({
  print: false
});
function create(input) {
  return AppRuntime.runPromise(SessionNs.Service.use(svc => svc.create(input)));
}
function get(id) {
  return AppRuntime.runPromise(SessionNs.Service.use(svc => svc.get(id)));
}
function remove(id) {
  return AppRuntime.runPromise(SessionNs.Service.use(svc => svc.remove(id)));
}
function updateMessage(msg) {
  return AppRuntime.runPromise(SessionNs.Service.use(svc => svc.updateMessage(msg)));
}
function updatePart(part) {
  return AppRuntime.runPromise(SessionNs.Service.use(svc => svc.updatePart(part)));
}
describe("session.created event", () => {
  test("should emit session.created event when session is created", async () => {
    await WithInstance.provide({
      directory: projectRoot,
      fn: async () => {
        let eventReceived = false;
        let receivedInfo;
        const unsub = Bus.subscribe(SessionNs.Event.Created, event => {
          eventReceived = true;
          receivedInfo = event.properties.info;
        });
        const info = await create({});
        await new Promise(resolve => setTimeout(resolve, 100));
        unsub();
        expect(eventReceived).toBe(true);
        expect(receivedInfo).toBeDefined();
        expect(receivedInfo?.id).toBe(info.id);
        expect(receivedInfo?.projectID).toBe(info.projectID);
        expect(receivedInfo?.directory).toBe(info.directory);
        expect(receivedInfo?.path).toBe(info.path);
        expect(receivedInfo?.title).toBe(info.title);
        await remove(info.id);
      }
    });
  });
  test("session.created event should be emitted before session.updated", async () => {
    await WithInstance.provide({
      directory: projectRoot,
      fn: async () => {
        const events = [];
        const unsubCreated = Bus.subscribe(SessionNs.Event.Created, () => {
          events.push("created");
        });
        const unsubUpdated = Bus.subscribe(SessionNs.Event.Updated, () => {
          events.push("updated");
        });
        const info = await create({});
        await new Promise(resolve => setTimeout(resolve, 100));
        unsubCreated();
        unsubUpdated();
        expect(events).toContain("created");
        expect(events).toContain("updated");
        expect(events.indexOf("created")).toBeLessThan(events.indexOf("updated"));
        await remove(info.id);
      }
    });
  });
});
describe("step-finish token propagation via Bus event", () => {
  test("non-zero tokens propagate through PartUpdated event", async () => {
    await WithInstance.provide({
      directory: projectRoot,
      fn: async () => {
        const info = await create({});
        const messageID = MessageID.ascending();
        await updateMessage({
          id: messageID,
          sessionID: info.id,
          role: "user",
          time: {
            created: Date.now()
          },
          agent: "user",
          model: {
            providerID: "test",
            modelID: "test"
          },
          tools: {},
          mode: ""
        });

        // Bus subscribers receive readonly Schema.Type payloads; `MessageV2.Part`
        // is the mutable domain type. Cast bridges the two — safe because the
        // test only reads the value afterwards.
        let received;
        const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, event => {
          received = event.properties.part;
        });
        const tokens = {
          total: 1500,
          input: 500,
          output: 800,
          reasoning: 200,
          cache: {
            read: 100,
            write: 50
          }
        };
        const partInput = {
          id: PartID.ascending(),
          messageID,
          sessionID: info.id,
          type: "step-finish",
          reason: "stop",
          cost: 0.005,
          tokens
        };
        await updatePart(partInput);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(received).toBeDefined();
        expect(received.type).toBe("step-finish");
        const finish = received;
        expect(finish.tokens.input).toBe(500);
        expect(finish.tokens.output).toBe(800);
        expect(finish.tokens.reasoning).toBe(200);
        expect(finish.tokens.total).toBe(1500);
        expect(finish.tokens.cache.read).toBe(100);
        expect(finish.tokens.cache.write).toBe(50);
        expect(finish.cost).toBe(0.005);
        expect(received).not.toBe(partInput);
        unsub();
        await remove(info.id);
      }
    });
  }, {
    timeout: 30000
  });
});
describe("Session", () => {
  test("remove works without an instance", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const info = await WithInstance.provide({
      directory: tmp.path,
      fn: () => create({
        title: "remove-without-instance"
      })
    });
    await expect(async () => {
      await remove(info.id);
    }).not.toThrow();
    let missing = false;
    await get(info.id).catch(() => {
      missing = true;
    });
    expect(missing).toBe(true);
  });
});