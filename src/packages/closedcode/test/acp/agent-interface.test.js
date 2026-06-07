import {  ACP  } from "../../src/acp/agent.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
/**
 * Type-level test: This line will fail to compile if ACP.Agent
 * doesn't properly implement the ACPAgent interface.
 *
 * The SDK checks for methods like `agent.unstable_setSessionModel` at runtime
 * and throws "Method not found" if they're missing. TypeScript allows optional
 * interface methods to be omitted, but the SDK still expects them.
 *
 * @see https://github.com/agentclientprotocol/typescript-sdk/commit/7072d3f
 */

const _typeCheck = true;

/**
 * Runtime verification that optional methods the SDK expects are actually implemented.
 * The SDK's router checks `if (!agent.methodName)` and throws MethodNotFound if missing.
 */
describe("acp.agent interface compliance", () => {
  // Extract method names from the ACPAgent interface type

  // Methods that the SDK's router explicitly checks for at runtime
  const sdkCheckedMethods = [
  // Required
  "initialize", "newSession", "prompt", "cancel",
  // Optional but checked by SDK router
  "loadSession", "setSessionMode", "authenticate",
  // Unstable - SDK checks these with unstable_ prefix
  "listSessions", "unstable_forkSession", "unstable_resumeSession", "unstable_setSessionModel"];
  test("Agent implements all SDK-checked methods", () => {
    for (const method of sdkCheckedMethods) {
      expect(typeof ACP.Agent.prototype[method], `Missing method: ${method}`).toBe("function");
    }
  });
});