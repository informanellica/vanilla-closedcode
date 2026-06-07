import { addons, types } from "storybook/manager-api";
import { ThemeTool } from "./theme-tool.js";
addons.register("closedcode/theme-toggle", () => {
  addons.add("closedcode/theme-toggle/tool", {
    type: types.TOOL,
    title: "Theme",
    match: ({
      viewMode
    }) => viewMode === "story" || viewMode === "docs",
    render: ThemeTool
  });
});