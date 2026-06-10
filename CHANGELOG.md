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
- **デスクトップ UI の vanilla 化レイヤー (bs/) を本番品質に修正**(自己改良ループ成果の取り込み):
  設定画面が真っ白 (Tabs を DOM 走査ベースに再設計) / モデルピッカー復元 (検索付き
  ポップオーバー・全モデル表示・重複排除・ポップ位置 = ref 転送・ツールチップ内
  ボタン無反応 = cloneNode 廃止) / 関数 children の固定評価×12ファイル / classList
  空白トークン×15ファイル / DropdownTrigger に as=コンポーネント / ツリーの M
  マーカーが深い階層に出ない / サブフォルダ展開で親が閉じる / ツリーヘッダーに
  開いているフォルダ名 / id=search ツール (grep 別名、モデルの search 連打ループ解消)
  / opencode 旧ロゴの完全削除 / serve の listen() にも requestTimeout=0。
  e2e: boot-smoke / opened-folder-name / model-selector (Playwright) を整備、
  memory router 用に __closedcode_openProject フックを追加。
- **`closedcode run` no longer hangs before starting on a non-TTY stdin that never
  reaches EOF.** When launched in the background or with an inherited pipe/tty
  (CI, `&`, redirected harnesses), the old `for await (… process.stdin)` waited for
  EOF that never came, wedging the run before the in-process server and agent loop
  even started — an intermittent "no output / no edit" hang with an empty log,
  easy to mistake for a model or integration failure. Piped stdin is now read with
  a **first-byte grace window** (`CLOSEDCODE_STDIN_IDLE_MS`, default 250 ms): if no
  data arrives the run proceeds; once any data is seen it is read to real EOF, so
  slow/streamed input is never truncated. `echo "msg" | closedcode run` still works.
  (`fix/cli-server-startup-hang`)

## [0.1.0-preview] — 2026-06-07

First public preview release (git tag `v0.1.0-preview`): Windows (64-bit) installer
and macOS (Apple Silicon) build. See `docs/` for the landing page and manual.
