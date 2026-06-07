import { describe, expect, test } from "@jest/globals";
import { terminalTabLabel } from "./terminal-label.js";
const t = (key, vars) => {
  if (key === "terminal.title.numbered") return `Terminal ${vars?.number}`;
  if (key === "terminal.title") return "Terminal";
  return key;
};
describe("terminalTabLabel", () => {
  test("returns custom title unchanged", () => {
    const label = terminalTabLabel({
      title: "server",
      titleNumber: 3,
      t
    });
    expect(label).toBe("server");
  });
  test("normalizes default numbered title", () => {
    const label = terminalTabLabel({
      title: "Terminal 2",
      titleNumber: 2,
      t
    });
    expect(label).toBe("Terminal 2");
  });
  test("falls back to generic title", () => {
    const label = terminalTabLabel({
      title: "",
      titleNumber: 0,
      t
    });
    expect(label).toBe("Terminal");
  });
});