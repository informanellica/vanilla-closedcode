// Lightweight client-side i18n for the vanilla-closedcode landing page.
// Auto-detects the browser language (fallback English), offers a language
// selector (#lang-switcher), and applies translations to [data-i18n],
// [data-i18n-html], [data-i18n-content], plus the page <title> via the
// <html data-title-key> attribute. Currently English + Japanese; adding a
// language is just another key in each entry below plus an item in LANGS.
(function () {
  const LANGS = [
    ["en", "English"], ["ja", "日本語"],
  ];

  const T = {
    // <head>
    page_title: { en: "vanilla-closedcode — a local-LLM-only desktop coding assistant", ja: "vanilla-closedcode — ローカル LLM 専用のコーディングアシスタント" },
    meta_desc: { en: "vanilla-closedcode — a local-LLM-only desktop coding assistant. Your code and prompts never leave your machine.", ja: "vanilla-closedcode — ローカル LLM 専用のコーディングアシスタント。コードとプロンプトは端末の外に出ません。" },

    // navbar
    nav_apidocs: { en: "API Docs", ja: "API ドキュメント" },
    nav_releases: { en: "Releases", ja: "リリース" },

    // hero
    hero_tagline: { en: "a local-LLM-only desktop coding assistant", ja: "ローカル LLM 専用のデスクトップ・コーディングアシスタント" },
    hero_lead: { en: 'vanilla-closedcode is a desktop coding assistant that runs entirely against your <strong>local LLM</strong>. Your code, prompts, and project context never leave your machine — no cloud API keys, no remote inference, no telemetry.', ja: 'vanilla-closedcode は、<strong>ローカル LLM</strong> だけで動作するコーディングアシスタントです。コード・プロンプト・プロジェクトの内容が端末の外に出ることはありません — クラウド API キー不要、リモート推論なし、テレメトリなし。' },
    btn_download: { en: "Download", ja: "ダウンロード" },
    btn_apidocs: { en: "API Documentation", ja: "API ドキュメント" },
    hero_badges: { en: '<i class="bi bi-shield-lock me-1"></i>100% local inference <span class="mx-1">/</span> <i class="bi bi-laptop me-1"></i>Desktop app + CLI <span class="mx-1">/</span> <i class="bi bi-windows me-1"></i>Windows <i class="bi bi-apple ms-2 me-1"></i>macOS', ja: '<i class="bi bi-shield-lock me-1"></i>100% ローカル推論 <span class="mx-1">/</span> <i class="bi bi-laptop me-1"></i>デスクトップアプリ＋CLI <span class="mx-1">/</span> <i class="bi bi-windows me-1"></i>Windows <i class="bi bi-apple ms-2 me-1"></i>macOS' },

    // highlights
    sec_highlights: { en: "Highlights", ja: "特長" },
    hl1_t: { en: "Local-LLM-only by design", ja: "設計からローカル LLM 専用" },
    hl1_d: { en: "All inference runs against a model on your own machine or LAN. No cloud providers, no API keys, no telemetry of your code or prompts.", ja: "すべての推論を自分のマシンまたは LAN 上のモデルで実行。クラウドプロバイダ・API キー・コードやプロンプトのテレメトリは一切ありません。" },
    hl2_t: { en: "Desktop app + CLI", ja: "デスクトップアプリ＋CLI" },
    hl2_d: { en: 'Use the <code>closedcode</code> command-line agent or the desktop app — both share the same core engine.', ja: '<code>closedcode</code> コマンドライン版、またはデスクトップアプリのどちらでも。両者は同じコアエンジンを共有します。' },
    hl3_t: { en: "Edits, runs, and reviews code", ja: "コードの編集・実行・レビュー" },
    hl3_d: { en: "Reads your project, proposes and applies edits across files, and runs tools — with you in the loop for every change.", ja: "プロジェクトを読み取り、複数ファイルにまたがる編集を提案・適用し、ツールを実行。すべての変更はあなたの確認のもとで行われます。" },
    hl4_t: { en: "Modular monorepo", ja: "モジュラーなモノレポ" },
    hl4_d: { en: "Built as composable packages (core, SDK, app, CLI) so you can embed or extend the agent in your own tooling.", ja: "構成可能なパッケージ（コア・SDK・アプリ・CLI）で構築。自分のツールにエージェントを組み込んだり拡張したりできます。" },
    hl5_t: { en: "Bring your own model", ja: "好きなモデルを使える" },
    hl5_d: { en: "Point it at any OpenAI-compatible endpoint — Ollama, LM Studio, llama.cpp, or your own server. No vendor lock-in.", ja: "OpenAI 互換エンドポイントなら何でも指定可能 — Ollama・LM Studio・llama.cpp・自前サーバーなど。ベンダーロックインなし。" },
    hl6_t: { en: "English / Japanese docs", ja: "英語／日本語ドキュメント" },
    hl6_d: { en: 'API documentation is published in both <a href="./src/en/">English</a> and <a href="./src/ja/">Japanese</a>.', ja: 'API ドキュメントは <a href="./src/en/">英語</a> と <a href="./src/ja/">日本語</a> の両方で公開しています。' },

    // download
    sec_download: { en: "Download", ja: "ダウンロード" },
    dl_p: { en: "Builds are published on the GitHub Releases page. Grab the installer for your platform from the latest release.", ja: "ビルドは GitHub Releases ページで公開しています。最新リリースからお使いのプラットフォーム向けインストーラを入手してください。" },
    btn_releases: { en: "Go to Releases", ja: "リリースへ" },
    dl_li1: { en: '<strong>Windows</strong> (64-bit) — GUI installer <code>.exe</code> (code-signed), plus a CLI/TUI archive.', ja: '<strong>Windows</strong>（64-bit）— GUI インストーラ <code>.exe</code>（署名済み）と CLI/TUI アーカイブ。' },
    dl_li2: { en: '<strong>macOS</strong> (Apple Silicon / arm64) — GUI <code>.dmg</code>, plus a CLI/TUI archive.', ja: '<strong>macOS</strong>（Apple Silicon / arm64）— GUI <code>.dmg</code> と CLI/TUI アーカイブ。' },
    dl_li_linux: { en: '<strong>Linux</strong> (x64) — GUI <code>.AppImage</code> / <code>.deb</code> / <code>.rpm</code>, plus a CLI/TUI archive.', ja: '<strong>Linux</strong>（x64）— GUI <code>.AppImage</code> / <code>.deb</code> / <code>.rpm</code> と CLI/TUI アーカイブ。' },
    dl_li3: { en: "A local LLM runtime (for example an Ollama / llama.cpp compatible endpoint) is required for inference.", ja: "推論にはローカル LLM ランタイム（例: Ollama / llama.cpp 互換エンドポイント）が必要です。" },

    // getting started
    sec_getstarted: { en: "Getting started", ja: "はじめに" },
    gs1: { en: 'Download and install vanilla-closedcode from the <a href="https://github.com/informanellica/vanilla-closedcode/releases">Releases page</a>.', ja: '<a href="https://github.com/informanellica/vanilla-closedcode/releases">リリースページ</a>から vanilla-closedcode をダウンロードしてインストールします。' },
    gs2: { en: "Point it at your local model endpoint in the settings (no cloud keys needed).", ja: "設定でローカルモデルのエンドポイントを指定します（クラウドキーは不要）。" },
    gs3: { en: 'Open your project folder, then chat with the agent or run the <code>closedcode</code> CLI from a terminal.', ja: 'プロジェクトフォルダを開き、エージェントとチャットするか、ターミナルから <code>closedcode</code> CLI を実行します。' },
    gs4: { en: "Review and accept the proposed edits — nothing is sent to a remote server.", ja: "提案された編集を確認して適用します — リモートサーバーには何も送信されません。" },

    // documentation
    sec_docs: { en: "Documentation", ja: "ドキュメント" },
    docs_p: { en: "JSDoc-generated API documentation for the source is published in two languages:", ja: "ソースの JSDoc から生成した API ドキュメントを 2 言語で公開しています:" },
    docs_li1: { en: '<a href="./src/en/">API documentation (English)</a>', ja: '<a href="./src/en/">API ドキュメント（英語）</a>' },
    docs_li2: { en: '<a href="./src/ja/">API documentation (Japanese)</a>', ja: '<a href="./src/ja/">API ドキュメント（日本語）</a>' },
    docs_manual: { en: 'See the <a href="./manual.html">user manual</a> for usage guides and configuration.', ja: '使い方や設定は<a href="./manual.html">ユーザーマニュアル</a>をご覧ください。' },

    // support
    sec_support: { en: "Support", ja: "サポート" },
    support_p: { en: 'Join the <a href="https://discord.gg/6bvnqcH3">community Discord</a> for help and discussion. Questions, bug reports, and feature requests are also welcome on the <a href="https://github.com/informanellica/vanilla-closedcode/issues">GitHub issue tracker</a>, or contact <a href="mailto:support@informanellica.com">support@informanellica.com</a>.', ja: 'ヘルプや議論は<a href="https://discord.gg/6bvnqcH3">コミュニティ Discord</a>へ。質問・不具合報告・機能要望は<a href="https://github.com/informanellica/vanilla-closedcode/issues">GitHub Issue トラッカー</a>でも受け付けています。または <a href="mailto:support@informanellica.com">support@informanellica.com</a> までご連絡ください。' },

    // footer
    footer_album: { en: "← Software Album", ja: "← ソフトウェアアルバム" },
    footer_apidocs: { en: "API Docs", ja: "API ドキュメント" },
    footer_support: { en: "Support", ja: "サポート" },
  };

  function tr(key, lang) {
    const e = T[key];
    return e ? (e[lang] || e.en) : "";
  }

  function resolveLang() {
    const saved = localStorage.getItem("vcc_lang");
    if (saved && LANGS.some(([c]) => c === saved)) return saved;
    const n = (navigator.language || "en").toLowerCase();
    if (n.startsWith("ja")) return "ja";
    return "en";
  }

  function apply(lang) {
    document.documentElement.lang = lang.replace("_", "-");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = tr(el.dataset.i18n, lang); if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const v = tr(el.dataset.i18nHtml, lang); if (v) el.innerHTML = v;
    });
    document.querySelectorAll("[data-i18n-content]").forEach((el) => {
      const v = tr(el.dataset.i18nContent, lang); if (v) el.setAttribute("content", v);
    });
    const titleKey = document.documentElement.getAttribute("data-title-key");
    if (titleKey) document.title = tr(titleKey, lang);
  }

  function buildSwitcher(lang) {
    const host = document.getElementById("lang-switcher");
    if (!host) return;

    const group = document.createElement("div");
    group.className = "input-group input-group-sm";
    group.style.width = "auto";

    const icon = document.createElement("span");
    icon.className = "input-group-text";
    icon.innerHTML = '<i class="bi bi-translate"></i>';

    const sel = document.createElement("select");
    sel.className = "form-select form-select-sm";
    sel.setAttribute("aria-label", "Language / 言語");
    sel.title = "Language / 言語";
    sel.style.maxWidth = "9rem";
    for (const [code, name] of LANGS) {
      const o = document.createElement("option");
      o.value = code; o.textContent = name; if (code === lang) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      localStorage.setItem("vcc_lang", sel.value);
      apply(sel.value);
    });

    group.appendChild(icon);
    group.appendChild(sel);
    host.appendChild(group);
  }

  const lang = resolveLang();
  apply(lang);
  buildSwitcher(lang);
})();
