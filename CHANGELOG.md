# Changelog

All notable changes to ClosedCode are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Versioning / channels

ClosedCode preview builds are not semver-numbered; the build derives its version
string from the **release channel** as `0.0.0-<channel>-<timestamp>`
(`src/packages/script/src/index.js`). The channel is `CLOSEDCODE_CHANNEL` if set,
otherwise the current git branch.

- `0.1.0-preview` — the first public preview line (git tag `v0.1.0-preview`).
- `0.1.0-dev` — the active development line that supersedes the preview. Build it
  with `CLOSEDCODE_CHANNEL=0.1.0-dev` (e.g. `CLOSEDCODE_CHANNEL=0.1.0-dev npm run build`).

## [Unreleased] — 0.1.0-dev

Development line following `0.1.0-preview`.

### Fixed
- **`closedcode run` no longer hangs before starting on a non-TTY stdin that never
  reaches EOF.** When launched in the background or with an inherited pipe/tty
  (CI, `&`, redirected harnesses), the old `for await (… process.stdin)` waited for
  EOF that never came, wedging the run before the in-process server and agent loop
  even started — an intermittent "no output / no edit" hang with an empty log,
  easy to mistake for a model or integration failure. Piped stdin is now read with
  a short idle timeout (`CLOSEDCODE_STDIN_IDLE_MS`, default 250 ms); `echo "msg" |
  closedcode run` still works. (`fix/cli-server-startup-hang`)

## [0.1.0-preview] — 2026-06-07

First public preview release (git tag `v0.1.0-preview`): Windows (64-bit) installer
and macOS (Apple Silicon) build. See `docs/` for the landing page and manual.
