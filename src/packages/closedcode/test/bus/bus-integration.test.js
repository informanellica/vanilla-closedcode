import {  Schema  } from "effect"
import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  Bus  } from "../../src/bus/index.js"
import {  BusEvent  } from "../../src/bus/bus-event.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import { sleep } from "../lib/io.js";

const TestEvent = BusEvent.define("test.integration", Schema.Struct({
  value: Schema.Number
}));
function withInstance(directory, fn) {
  return WithInstance.provide({
    directory,
    fn
  });
}
describe("Bus integration: acquireRelease subscriber pattern", () => {
  afterEach(() => disposeAllInstances());
  test("subscriber via callback facade receives events and cleans up on unsub", async () => {
    await using tmp = await tmpdir();
    const received = [];
    await withInstance(tmp.path, async () => {
      const unsub = Bus.subscribe(TestEvent, evt => {
        received.push(evt.properties.value);
      });
      await sleep(10);
      await Bus.publish(TestEvent, {
        value: 1
      });
      await Bus.publish(TestEvent, {
        value: 2
      });
      await sleep(10);
      expect(received).toEqual([1, 2]);
      unsub();
      await sleep(10);
      await Bus.publish(TestEvent, {
        value: 3
      });
      await sleep(10);
      expect(received).toEqual([1, 2]);
    });
  });
  test("subscribeAll receives events from multiple types", async () => {
    await using tmp = await tmpdir();
    const received = [];
    const OtherEvent = BusEvent.define("test.other", Schema.Struct({
      value: Schema.Number
    }));
    await withInstance(tmp.path, async () => {
      Bus.subscribeAll(evt => {
        received.push({
          type: evt.type,
          value: evt.properties.value
        });
      });
      await sleep(10);
      await Bus.publish(TestEvent, {
        value: 10
      });
      await Bus.publish(OtherEvent, {
        value: 20
      });
      await sleep(10);
    });
    expect(received).toEqual([{
      type: "test.integration",
      value: 10
    }, {
      type: "test.other",
      value: 20
    }]);
  });
  test("subscriber cleanup on instance disposal interrupts the stream", async () => {
    await using tmp = await tmpdir();
    const received = [];
    let disposed = false;
    await withInstance(tmp.path, async () => {
      Bus.subscribeAll(evt => {
        if (evt.type === Bus.InstanceDisposed.type) {
          disposed = true;
          return;
        }
        received.push(evt.properties.value);
      });
      await sleep(10);
      await Bus.publish(TestEvent, {
        value: 1
      });
      await sleep(10);
    });
    await disposeAllInstances();
    await sleep(50);
    expect(received).toEqual([1]);
    expect(disposed).toBe(true);
  });
});