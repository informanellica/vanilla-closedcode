import {  McpOAuthCallback  } from "../../src/mcp/oauth-callback.js"
import {  parseRedirectUri  } from "../../src/mcp/oauth-provider.js"
import {  test, expect, describe, afterEach, beforeAll  } from "@jest/globals"
describe("parseRedirectUri", () => {
  test("returns defaults when no URI provided", () => {
    const result = parseRedirectUri();
    expect(result.port).toBe(19876);
    expect(result.path).toBe("/mcp/oauth/callback");
  });
  test("parses port and path from URI", () => {
    const result = parseRedirectUri("http://127.0.0.1:8080/oauth/callback");
    expect(result.port).toBe(8080);
    expect(result.path).toBe("/oauth/callback");
  });
  test("returns defaults for invalid URI", () => {
    const result = parseRedirectUri("not-a-valid-url");
    expect(result.port).toBe(19876);
    expect(result.path).toBe("/mcp/oauth/callback");
  });
});
describe("McpOAuthCallback.ensureRunning", () => {
  afterEach(async () => {
    await McpOAuthCallback.stop();
  });
  test("starts server with custom redirectUri port and path", async () => {
    await McpOAuthCallback.ensureRunning("http://127.0.0.1:18000/custom/callback");
    expect(McpOAuthCallback.isRunning()).toBe(true);
  });
});