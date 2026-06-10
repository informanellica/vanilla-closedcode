import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, For } from "solid-js";
import { DEFAULT_THEMES, useTheme } from "#tui/context/theme.js";
const themeCount = Object.keys(DEFAULT_THEMES).length;
const themeTip = `Use {highlight}/themes{/highlight} or {highlight}Ctrl+X T{/highlight} to switch between ${themeCount} built-in themes`;
function parse(tip) {
  const parts = [];
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g;
  const found = Array.from(tip.matchAll(regex));
  const state = found.reduce((acc, match) => {
    const start = match.index ?? 0;
    if (start > acc.index) {
      acc.parts.push({
        text: tip.slice(acc.index, start),
        highlight: false
      });
    }
    acc.parts.push({
      text: match[1],
      highlight: true
    });
    acc.index = start + match[0].length;
    return acc;
  }, {
    parts,
    index: 0
  });
  if (state.index < tip.length) {
    parts.push({
      text: tip.slice(state.index),
      highlight: false
    });
  }
  return parts;
}
const NO_MODELS_TIP = "Run {highlight}/connect{/highlight} to add an AI provider and start coding";
export function Tips(props) {
  const theme = useTheme().theme;
  const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
  const parts = createMemo(() => parse(props.connected === false ? NO_MODELS_TIP : randomTip));
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("text"),
      _el$3 = _$createTextNode(`◁ETip `),
      _el$5 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$5);
    _$setProp(_el$, "flexDirection", "row");
    _$setProp(_el$, "maxWidth", "100%");
    _$insertNode(_el$2, _el$3);
    _$setProp(_el$2, "flexShrink", 0);
    _$setProp(_el$5, "flexShrink", 1);
    _$insert(_el$5, _$createComponent(For, {
      get each() {
        return parts();
      },
      children: part => (() => {
        var _el$6 = _$createElement("span");
        _$insert(_el$6, () => part.text);
        _$effect(_$p => _$setProp(_el$6, "style", {
          fg: part.highlight ? theme.text : theme.textMuted
        }, _$p));
        return _el$6;
      })()
    }));
    _$effect(_$p => _$setProp(_el$2, "style", {
      fg: theme.warning
    }, _$p));
    return _el$;
  })();
}
const TIPS = ["Type {highlight}@{/highlight} followed by a filename to fuzzy search and attach files", "Start a message with {highlight}!{/highlight} to run shell commands directly (e.g., {highlight}!ls -la{/highlight})", "Press {highlight}Tab{/highlight} to cycle between Build and Plan agents", "Use {highlight}/undo{/highlight} to revert the last message and file changes", "Use {highlight}/redo{/highlight} to restore previously undone messages and file changes", "Drag and drop images or PDFs into the terminal to add them as context", "Press {highlight}Ctrl+V{/highlight} to paste images from your clipboard into the prompt", "Press {highlight}Ctrl+X E{/highlight} or {highlight}/editor{/highlight} to compose messages in your external editor", "Run {highlight}/init{/highlight} to auto-generate project rules based on your codebase", "Run {highlight}/models{/highlight} or {highlight}Ctrl+X M{/highlight} to see and switch between available AI models", themeTip, "Press {highlight}Ctrl+X N{/highlight} or {highlight}/new{/highlight} to start a fresh conversation session", "Use {highlight}/sessions{/highlight} or {highlight}Ctrl+X L{/highlight} to list and continue previous conversations", "Run {highlight}/compact{/highlight} to summarize long sessions near context limits", "Press {highlight}Ctrl+X X{/highlight} or {highlight}/export{/highlight} to save the conversation as Markdown", "Press {highlight}Ctrl+X Y{/highlight} to copy the assistant's last message to clipboard", "Press {highlight}Ctrl+P{/highlight} to see all available actions and commands", "Run {highlight}/connect{/highlight} to add API keys for 75+ supported LLM providers", "The leader key is {highlight}Ctrl+X{/highlight}; combine with other keys for quick actions", "Press {highlight}F2{/highlight} to quickly switch between recently used models", "Press {highlight}Ctrl+X B{/highlight} to show/hide the sidebar panel", "Use {highlight}PageUp{/highlight}/{highlight}PageDown{/highlight} to navigate through conversation history", "Press {highlight}Ctrl+G{/highlight} or {highlight}Home{/highlight} to jump to the beginning of the conversation", "Press {highlight}Ctrl+Alt+G{/highlight} or {highlight}End{/highlight} to jump to the most recent message", "Press {highlight}Shift+Enter{/highlight} or {highlight}Ctrl+J{/highlight} to add newlines in your prompt", "Press {highlight}Ctrl+C{/highlight} when typing to clear the input field", "Press {highlight}Escape{/highlight} to stop the AI mid-response", "Switch to {highlight}Plan{/highlight} agent to get suggestions without making actual changes", "Use {highlight}@agent-name{/highlight} in prompts to invoke specialized subagents", "Press {highlight}Ctrl+X Right/Left{/highlight} to cycle through parent and child sessions", "Create {highlight}closedcode.json{/highlight} for server settings and {highlight}tui.json{/highlight} for TUI settings", "Place TUI settings in {highlight}~/.config/closedcode/tui.json{/highlight} for global config", "Configure {highlight}model{/highlight} in config to set your default model", "Override any keybind in {highlight}tui.json{/highlight} via the {highlight}keybinds{/highlight} section", "Set any keybind to {highlight}none{/highlight} to disable it completely", "Configure local or remote MCP servers in the {highlight}mcp{/highlight} config section", "ClosedCode auto-handles OAuth for remote MCP servers requiring auth", "Add {highlight}.md{/highlight} files to {highlight}.closedcode/command/{/highlight} to define reusable custom prompts", "Use {highlight}$ARGUMENTS{/highlight}, {highlight}$1{/highlight}, {highlight}$2{/highlight} in custom commands for dynamic input", "Use backticks in commands to inject shell output (e.g., {highlight}`git status`{/highlight})", "Add {highlight}.md{/highlight} files to {highlight}.closedcode/agent/{/highlight} for specialized AI personas", "Configure per-agent permissions for {highlight}edit{/highlight}, {highlight}bash{/highlight}, and {highlight}webfetch{/highlight} tools", 'Use patterns like {highlight}"git *": "allow"{/highlight} for granular bash permissions', 'Set {highlight}"rm -rf *": "deny"{/highlight} to block destructive commands', 'Configure {highlight}"git push": "ask"{/highlight} to require approval before pushing', "ClosedCode auto-formats files using prettier, gofmt, ruff, and more", 'Set {highlight}"formatter": false{/highlight} in config to disable all auto-formatting', "Define custom formatter commands with file extensions in config", "ClosedCode uses LSP servers for intelligent code analysis", "Create {highlight}.mjs{/highlight} files in {highlight}.closedcode/tools/{/highlight} to define new LLM tools", "Tool definitions can invoke scripts written in Python, Go, etc", "Add {highlight}.mjs{/highlight} files to {highlight}.closedcode/plugin/{/highlight} for event hooks", "Use plugins to send OS notifications when sessions complete", "Create a plugin to prevent ClosedCode from reading sensitive files", "Use {highlight}closedcode run{/highlight} for non-interactive scripting", "Use {highlight}closedcode --continue{/highlight} to resume the last session", "Use {highlight}closedcode run -f file.js{/highlight} to attach files via CLI", "Use {highlight}--format json{/highlight} for machine-readable output in scripts", "Run {highlight}closedcode serve{/highlight} for headless API access to ClosedCode", "Use {highlight}closedcode run --attach{/highlight} to connect to a running server", "Run {highlight}closedcode upgrade{/highlight} to update to the latest version", "Run {highlight}closedcode auth list{/highlight} to see all configured providers", "Run {highlight}closedcode agent create{/highlight} for guided agent creation", 'Use {highlight}"theme": "system"{/highlight} to match your terminal\'s colors', "Create JSON theme files in {highlight}.closedcode/themes/{/highlight} directory", "Themes support dark/light variants for both modes", "Reference ANSI colors 0-255 in custom themes", "Use {highlight}{env:VAR_NAME}{/highlight} syntax to reference environment variables in config", "Use {highlight}{file:path}{/highlight} to include file contents in config values", "Use {highlight}instructions{/highlight} in config to load additional rules files", "Set agent {highlight}temperature{/highlight} from 0.0 (focused) to 1.0 (creative)", "Configure {highlight}steps{/highlight} to limit agentic iterations per request", 'Set {highlight}"tools": {"bash": false}{/highlight} to disable specific tools', 'Set {highlight}"mcp_*": false{/highlight} to disable all tools from an MCP server', "Override global tool settings per agent configuration", 'Set {highlight}"share": "auto"{/highlight} to automatically share all sessions', 'Set {highlight}"share": "disabled"{/highlight} to prevent any session sharing', "Run {highlight}/unshare{/highlight} to remove a session from public access", "Permission {highlight}doom_loop{/highlight} prevents infinite tool call loops", "Permission {highlight}external_directory{/highlight} protects files outside project", "Run {highlight}closedcode debug config{/highlight} to troubleshoot configuration", "Use {highlight}--print-logs{/highlight} flag to see detailed logs in stderr", "Press {highlight}Ctrl+X G{/highlight} or {highlight}/timeline{/highlight} to jump to specific messages", "Press {highlight}Ctrl+X H{/highlight} to toggle code block visibility in messages", "Press {highlight}Ctrl+X S{/highlight} or {highlight}/status{/highlight} to see system status info", "Enable {highlight}scroll_acceleration{/highlight} in {highlight}tui.json{/highlight} for smooth macOS-style scrolling", "Toggle username display in chat via command palette ({highlight}Ctrl+P{/highlight})", "Commit your project's {highlight}AGENTS.md{/highlight} file to Git for team sharing", "Use {highlight}/review{/highlight} to review uncommitted changes, branches, or PRs", "Run {highlight}/help{/highlight} or {highlight}Ctrl+X H{/highlight} to show the help dialog", "Use {highlight}/rename{/highlight} to rename the current session", ...(process.platform === "win32" ? ["Press {highlight}Ctrl+Z{/highlight} to undo changes in your prompt"] : ["Press {highlight}Ctrl+Z{/highlight} to suspend the terminal and return to your shell"])];