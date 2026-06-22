## 🎉 ClosedCode v0.1.0

A **local-only, no-egress AI coding workspace** with full-featured CLI, desktop GUI, and TUI support.

### 🆕 New in v0.1.0 — chat-pane workspace & session management (June 21, 2026)
- **Multiple chat sessions as TABS**: the bottom chat pane is now a tabbed workspace. `+` opens a new session as a tab; click a tab to switch, the pencil renames it inline, and `×` or a **middle-click** closes it. **The open tabs are persisted per workspace and restored on restart.**
- **Searchable session-history popup** (the clock icon, dropping down on-screen and staying within the viewport): a search box filters the list, each row reveals **rename** (pencil) and **delete** (trash, with a confirm) actions on hover, and a **"もっと読む" (load more)** button fetches sessions beyond the synced/trimmed working set.
- **Category tabs (tabs-within-tabs)** across the panels: a `チャット` category above the session tabs in the chat pane, `エクスプローラー` on the left sidebar and `レビュー` on the right sidebar — a scaffold for future categories such as a terminal.
- **Theme-aware pane-resize cursor**: the resize handles use a custom double-arrow cursor (dark on light themes, light on dark) instead of the OS cursor that rendered as a hard-to-see white glyph, plus a visible hover divider.
- **Fixes**: a crash when switching session tabs mid-stream (`reading 'id'`), a blank agent selector in the composer (the vanilla `Select` snapshotted its options before the agents loaded), and the splash + main window briefly appearing on screen together at startup.

### Also in this release (June 20, 2026)
- **Interactive TUI works end-to-end**: prompts and slash/shell commands now stream immediately (no more stalling on the home screen), **permission and question prompts appear again**, and the launch flags `--continue` (resume the most recent session), `--model`, and `--fork` are honored.
- **Linux CLI/TUI build is glibc (Debian-built)**: `closedcode-linux-x64.tar.gz` is produced on Debian (glibc) via `Dockerfile.sea-linux`; musl/Alpine is **not** a build target this release. The npm wrapper declares `linux-arm64` for forward-compat but does not yet publish it.
- **Stability hardening**: the in-house vanilla reactivity shim (`ErrorBoundary` / `Show` / `For` resource cleanup + synchronous-error routing) and serialized SQLite transactions remove a family of boot/teardown races.
- **Docs**: full JSDoc coverage of the own-source code + regenerated **bilingual (en/ja) API reference**.

<details><summary>Earlier in the dev line (June 16, 2026)</summary>

- **New tab = in-memory untitled buffer**: the editor "+" no longer creates an `untitled.md` on disk or errors with ENOENT — it opens an empty in-memory buffer and prompts a native *Save As* on first save (then swaps the tab for the real file; discard-safe).
- **Customizable toolbar**: Office-Quick-Access-Toolbar-style two-pane reorder / show-hide customizer at **設定 → 一般 → ツールバー**; order + visibility persist.
- **Editor find/replace**: VS Code-style widget (case/word/regex, match counter, replace + replace-all).
- **Bootstrap modals**: delete confirmation and save-on-close (`保存しますか？`) replace native popups.
- **Stability fixes**: review-panel diff previews, blank editor/tab panes, white splash / first-paint, unsaved-edit preservation.
- **Docs**: refreshed online manual + JSDoc API reference (en/ja).

</details>

### 📦 Assets in this build
| Component | Platform | File |
|-----------|----------|------|
| Desktop GUI | Windows x64 (NSIS installer, code-signed) | `vanilla-closedcode-win-x64.exe` |
| Desktop GUI | macOS arm64 (Apple Silicon, DMG) | `vanilla-closedcode-mac-arm64.dmg` |
| Desktop GUI | Linux x64 (AppImage) | `vanilla-closedcode-linux-x86_64.AppImage` |
| Desktop GUI | Linux x64 (Debian) | `vanilla-closedcode-linux-amd64.deb` |
| Desktop GUI | Linux x64 (RPM) | `vanilla-closedcode-linux-x86_64.rpm` |
| CLI + TUI (Node SEA) | Windows x64 | `closedcode-windows-x64.tar.gz` |
| CLI + TUI (Node SEA) | macOS arm64 | `closedcode-darwin-arm64.tar.gz` |
| CLI + TUI (Node SEA) | Linux x64 (glibc) | `closedcode-linux-x64.tar.gz` |

> CLI/TUI archives contain the SEA binary plus its native sidecars — extract the whole folder and run `bin/closedcode(.exe)`. Linux GUI/CLI binaries may need `chmod +x` after download. The macOS `.dmg` and the `closedcode-darwin-arm64.tar.gz` archive are included in this release. The Windows GUI installer is code-signed; the CLI archives and Linux binaries are unsigned.

### ✨ Highlights

#### 🖥️ Desktop GUI (Electron)
- **Vanilla (solid-free) interface** — the in-house reactivity shim fully replaces `solid-js`
- In-app CodeMirror editor with tabs, file tree, and custom file operations
- Tabbed chat-pane workspace with a searchable session history and tabs-within-tabs category bars
- Local LLM providers (Ollama, LM Studio, OpenAI-compatible endpoints)
- Build-less architecture (native ESM renderer served over `vcc://`)

#### 💻 CLI + 🖲️ TUI
- One Node SEA binary: run with no args for the interactive TUI, or subcommands for the CLI
- Syntax-highlighted diffs, external editor integration, MCP/skill dialogs
- Works with any OpenAI-compatible LLM

### 🔐 Security & Privacy
- ✅ No telemetry · ✅ No cloud services required · ✅ Local execution only · ✅ Bring-your-own LLM

---

**Release:** v0.1.0 · **Date:** June 21, 2026 · **Tag:** `v0.1.0` (cut from the `0.1.0-dev` line)
