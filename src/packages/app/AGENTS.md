## Debugging

- NEVER try to restart the app, or the server process, EVER.

## Local Dev

- Local UI changes should be tested via the ClosedCode app/dev flow described below.
- Run the backend and app dev servers separately.
- Backend (from `packages/closedcode`): `npm run --conditions=browser ./src/index.js serve --port 4096`
- App (from `packages/app`): `npm run dev -- --port 4444`
- Open `http://localhost:4444` to verify UI changes (it targets the backend at `http://localhost:4096`).

## SolidJS

- **Vanilla JS only — no JSX, no TypeScript, no React** (see root `AGENTS.md`).
  This package is build-less: the `.js` files under `src/` are the runtime source of
  truth, so write SolidJS in its compiled plain-JS form (`_$template`,
  `_$createComponent`, `_$insert`, …). Author no `.jsx`/`.ts`/`.tsx` files. Prefer
  CSS for purely visual changes.
- Always prefer `createStore` over multiple `createSignal` calls

## Tool Calling

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
