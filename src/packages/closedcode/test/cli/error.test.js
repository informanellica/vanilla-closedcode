import {  AccountTransportError  } from "../../src/account/schema.js"
import {  FormatError  } from "../../src/cli/error.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
describe("cli.error", () => {
  test("formats account transport errors clearly", () => {
    const error = new AccountTransportError({
      method: "POST",
      url: "https://example.com/auth/device/code"
    });
    const formatted = FormatError(error);
    expect(formatted).toContain("Could not reach POST https://example.com/auth/device/code.");
    expect(formatted).toContain("This failed before the server returned an HTTP response.");
    expect(formatted).toContain("Check your network, proxy, or VPN configuration and try again.");
  });
});