<h1 align="center">ClosedCode</h1>
<p align="center">A local-LLM-only fork of <a href="https://github.com/sst/opencode">opencode</a>.</p>

> **Attribution / NOTICE.** ClosedCode is based on [opencode](https://github.com/sst/opencode)
> by anomalyco/sst, distributed under the MIT License (preserved in [LICENSE](src/LICENSE)).
> ClosedCode is **not affiliated with, endorsed by, or supported by** the opencode team.

<p align="center"><b>English</b> | <a href="README.ja.md">日本語</a></p>

- **Website / docs:** <https://informanellica.github.io/vanilla-closedcode/>
- **User manual:** <https://informanellica.github.io/vanilla-closedcode/manual.html>
- **API documentation:** <https://informanellica.github.io/vanilla-closedcode/src/>
- **Download (latest release):** <https://github.com/informanellica/vanilla-closedcode/releases/latest>
- **Changelog:** <https://github.com/informanellica/vanilla-closedcode/releases>

Runs on **Windows** and **macOS** (Apple Silicon).

## What This Fork Is

ClosedCode keeps the opencode-style terminal/client-server workflow, but the LLM path is local-only.
It is intended for local or private-network OpenAI-compatible LLM servers such as Ollama,
LM Studio, llama.cpp, vLLM, Jan, and similar runtimes.

The runtime currently:

- bundles OpenAI-compatible provider support for local endpoints;
- filters provider listings to local/private-network LLM providers;
- allows LLM endpoints on `localhost`, private IP ranges, and local hostnames such as `.local`, `.lan`, and `.internal`;
- blocks LLM fetches to public hosts at runtime.

This does not mean every non-LLM feature is offline. Git, GitHub, MCP servers, package installation,
documentation links, or user-configured tools may still perform network access when you invoke or
configure them. The local-only policy is specifically about LLM providers and LLM requests.

## Running From This Checkout

The source tree lives under [`src/`](src/). Run all commands from there:

```bash
cd src
npm install
```

Start the ClosedCode package in development mode:

```bash
npm run dev
```

Build the package binary:

```bash
npm --prefix packages/closedcode run build
```

Run the package binary from this checkout:

```bash
./packages/closedcode/bin/closedcode
```

Older public installer, desktop download, Homebrew, Scoop, Chocolatey, and website links from the
upstream project should not be treated as authoritative for this fork unless they are reintroduced
and verified in this repository.

## Local LLM Configuration

Start a local OpenAI-compatible server first. For example, Ollama commonly listens on
`http://127.0.0.1:11434/v1`.

Then configure ClosedCode with a local provider and model. Some inherited config names still use
`opencode` for compatibility with upstream:

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

The model id must match a model exposed by your local server. Public cloud LLM endpoints are not a
supported target for this app.

## Agents

ClosedCode includes built-in agents you can switch between with the `Tab` key.

- **build** - default development agent
- **plan** - read-only analysis and planning agent
- **general** - subagent for complex searches and multistep tasks

## Development Notes

Run tests from package directories (within `src/`), not from the `src/` root. The root `npm test`
script is a guard and intentionally exits with an error.

```bash
cd src
npm --prefix packages/closedcode test -- test/session/llm.test.js --runInBand
```


## FAQ

### How is this different from opencode or Claude Code?

ClosedCode is built from opencode, but this fork is configured for local LLM use only. Cloud-only LLM
providers are filtered out, and public-host LLM requests are blocked at runtime.

The rest of the experience is still centered on a terminal UI, client/server architecture, agent
workflows, and optional integrations inherited from the upstream project where they still apply.
