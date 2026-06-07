import {  resource  } from "core/effect/observability"
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
const otelResourceAttributes = process.env.OTEL_RESOURCE_ATTRIBUTES;
const previousClient = process.env.CLOSEDCODE_CLIENT;
afterEach(() => {
  if (otelResourceAttributes === undefined) delete process.env.OTEL_RESOURCE_ATTRIBUTES;else process.env.OTEL_RESOURCE_ATTRIBUTES = otelResourceAttributes;
  if (previousClient === undefined) delete process.env.CLOSEDCODE_CLIENT;else process.env.CLOSEDCODE_CLIENT = previousClient;
});
describe("resource", () => {
  test("parses and decodes OTEL resource attributes", () => {
    process.env.OTEL_RESOURCE_ATTRIBUTES = "service.namespace=anomalyco,team=platform%2Cobservability,label=hello%3Dworld,key%2Fname=value%20here";
    expect(resource().attributes).toMatchObject({
      "service.namespace": "anomalyco",
      team: "platform,observability",
      label: "hello=world",
      "key/name": "value here"
    });
  });
  test("drops OTEL resource attributes when any entry is invalid", () => {
    process.env.OTEL_RESOURCE_ATTRIBUTES = "service.namespace=anomalyco,broken";
    expect(resource().attributes["service.namespace"]).toBeUndefined();
    expect(resource().attributes["closedcode.client"]).toBeDefined();
  });
  test("keeps built-in attributes when env values conflict", () => {
    process.env.CLOSEDCODE_CLIENT = "cli";
    process.env.OTEL_RESOURCE_ATTRIBUTES = "closedcode.client=web,service.instance.id=override,service.namespace=anomalyco";
    expect(resource().attributes).toMatchObject({
      "closedcode.client": "cli",
      "service.namespace": "anomalyco"
    });
    expect(resource().attributes["service.instance.id"]).not.toBe("override");
  });
});