import { beforeEach, describe, expect, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const src = await readFile(fileURLToPath(new URL("../public/vcc-theme-preload.js", import.meta.url)), "utf8");
const run = () => Function(src)();
const setMatchMedia = matches => {
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches }),
    configurable: true
  });
};
beforeEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-bs-theme");
  localStorage.clear();
  setMatchMedia(false);
});
describe("theme preload", () => {
  test("defaults to light when no scheme is stored and system is light", () => {
    run();
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");
  });
  test("follows system dark via prefers-color-scheme", () => {
    setMatchMedia(true);
    run();
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
  });
  test("honors an explicit dark scheme from canonical key", () => {
    localStorage.setItem("closedcode-color-scheme", "dark");
    run();
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
  });
  test("honors an explicit light scheme even when system is dark", () => {
    setMatchMedia(true);
    localStorage.setItem("closedcode-color-scheme", "light");
    run();
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");
  });
  test("ignores legacy opencode-color-scheme key", () => {
    localStorage.setItem("opencode-color-scheme", "dark");
    setMatchMedia(false);
    run();
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");
  });
  test("does not inject token CSS", () => {
    run();
    expect(document.getElementById("vcc-theme-preload")).toBeNull();
  });
});
