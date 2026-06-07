<h1 align="center">ClosedCode</h1>
<p align="center"><a href="https://github.com/sst/opencode">opencode</a> をベースにした、ローカル LLM 専用フォーク。</p>

> **帰属表示 / NOTICE.** ClosedCode は anomalyco/sst による [opencode](https://github.com/sst/opencode)
> を基にしており、MIT ライセンスで配布されています（[LICENSE](src/LICENSE) に保持）。
> ClosedCode は opencode チームとは **提携・承認・サポートの関係にありません**。

<p align="center"><a href="README.md">English</a> | <b>日本語</b></p>

- **公式サイト / ドキュメント:** <https://informanellica.github.io/vanilla-closedcode/>
- **ユーザーマニュアル:** <https://informanellica.github.io/vanilla-closedcode/manual.html>
- **API ドキュメント:** <https://informanellica.github.io/vanilla-closedcode/src/>
- **ダウンロード（最新リリース）:** <https://github.com/informanellica/vanilla-closedcode/releases/latest>
- **更新履歴:** <https://github.com/informanellica/vanilla-closedcode/releases>

対応 OS: **Windows** / **macOS**（Apple Silicon）。

## このフォークについて

ClosedCode は opencode 由来のターミナル / クライアント・サーバー型ワークフローを維持しつつ、
LLM の通信経路を **ローカル専用** にしています。Ollama・LM Studio・llama.cpp・vLLM・Jan などの、
ローカルまたはプライベートネットワーク上の OpenAI 互換 LLM サーバーでの利用を想定しています。

現在のランタイムは:

- ローカルエンドポイント向けに OpenAI 互換プロバイダーのサポートを同梱
- プロバイダー一覧をローカル / プライベートネットワークの LLM プロバイダーに絞り込み
- `localhost`、プライベート IP 範囲、`.local` / `.lan` / `.internal` などのローカルホスト名の LLM エンドポイントを許可
- パブリックホストへの LLM フェッチをランタイムでブロック

これは LLM 以外のすべての機能がオフラインという意味ではありません。Git・GitHub・MCP サーバー・
パッケージインストール・ドキュメントリンク・ユーザー設定のツールなどは、呼び出しや設定の際に
ネットワークアクセスを行う場合があります。ローカル専用ポリシーは **LLM プロバイダーと LLM リクエスト**
に限った話です。

## このチェックアウトから実行する

ソースツリーは [`src/`](src/) 配下にあります。コマンドはすべてそこで実行してください:

```bash
cd src
npm install
```

ClosedCode パッケージを開発モードで起動:

```bash
npm run dev
```

パッケージのバイナリをビルド:

```bash
npm --prefix packages/closedcode run build
```

このチェックアウトからバイナリを実行:

```bash
./packages/closedcode/bin/closedcode
```

upstream プロジェクトの古い公開インストーラ・デスクトップ版ダウンロード・Homebrew・Scoop・
Chocolatey・ウェブサイトのリンクは、本リポジトリで再導入・検証されない限り、本フォークの
正式なものとして扱わないでください。

## ローカル LLM の設定

まずローカルの OpenAI 互換サーバーを起動します。例えば Ollama は通常
`http://127.0.0.1:11434/v1` で待ち受けます。

次に、ローカルプロバイダーとモデルを ClosedCode に設定します。一部の継承された設定名は
upstream との互換性のため `opencode` のままです:

```json
{
  "enabled_providers": ["ollama"],
  "model": "ollama/gpt-oss:20b",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "http://127.0.0.1:11434/v1",
        "apiKey": "not-needed"
      }
    }
  }
}
```

モデル ID はローカルサーバーが公開しているモデルと一致する必要があります。パブリッククラウドの
LLM エンドポイントは本アプリの対象外です。

## エージェント

ClosedCode には `Tab` キーで切り替えできる組み込みエージェントがあります。

- **build** — デフォルトの開発用エージェント
- **plan** — 読み取り専用の分析・計画エージェント
- **general** — 複雑な検索やマルチステップ処理向けのサブエージェント

## 開発メモ

テストは（`src/` 内の）各パッケージのディレクトリから実行してください。`src/` 直下の
`npm test` はガードであり、意図的にエラー終了します。

```bash
cd src
npm --prefix packages/closedcode test -- test/session/llm.test.js --runInBand
```

## FAQ

### opencode や Claude Code と何が違うのですか？

ClosedCode は opencode から構築されていますが、本フォークはローカル LLM 専用に設定されています。
クラウド専用の LLM プロバイダーは除外され、パブリックホストへの LLM リクエストはランタイムで
ブロックされます。

それ以外の体験は、ターミナル UI・クライアント / サーバー構成・エージェントワークフロー、および
upstream から引き継いだ任意の連携機能（該当する場合）を中心としています。
