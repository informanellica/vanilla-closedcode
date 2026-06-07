// Side-effect helper: mocks `@/cli/cmd/tui/config/tui.js` so test code can
// override `TuiConfig.waitForDependencies()`. Native ESM module namespaces are
// frozen, so `jest.spyOn(TuiConfig, "waitForDependencies")` (the original Bun
// test pattern) is not legal under Jest's vm-modules loader. Import this file
// *before* importing any source module that pulls in tui config.
import { jest } from "@jest/globals";
const realModule = await import("@/cli/cmd/tui/config/tui.js");
export const waitForDependenciesMock = jest.fn(async () => {});
jest.unstable_mockModule("@/cli/cmd/tui/config/tui.js", () => ({
  ...realModule,
  TuiConfig: {
    ...realModule.TuiConfig,
    waitForDependencies: waitForDependenciesMock,
  },
  waitForDependencies: waitForDependenciesMock,
}));
export function useWaitForDependencies() {
  waitForDependenciesMock.mockReset();
  waitForDependenciesMock.mockImplementation(async () => {});
  return waitForDependenciesMock;
}
