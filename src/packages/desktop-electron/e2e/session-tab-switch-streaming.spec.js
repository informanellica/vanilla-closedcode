// e2e for the crash the user hit: while an assistant turn is STREAMING (the
// session is "thinking"), switching to another session TAB crashes the whole
// session view with "Cannot read properties of undefined (reading 'id')",
// surfaced by the SessionRoute ErrorBoundary as
//   "Session view error (sidecar chat still works): ..."
//
// The empty-session tab tests (session-tabs.spec.js) never stream, so they
// missed it. This test stands up a slow mock OpenAI-compatible server, starts a
// real streaming turn in one tab, then switches tabs (via "+" and by clicking
// tab labels) WHILE the turn is in flight, asserting the ErrorBoundary text
// never appears.
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  freePort,
  gotoProject,
  killAndWait,
  launchDesktopWithConfig,
  rendererPage,
  rmWithRetry,
} from "./helpers.js";

const MODEL_ID = "slow-model";

// Slow OpenAI-compatible mock: answers /v1/models and streams /v1/chat/completions
// with ~700ms gaps so a turn stays in flight while we switch tabs.
async function startMockProvider(port) {
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    req.on("data", () => {});
    if (req.method === "GET" && url.includes("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: MODEL_ID, object: "model", created: 0, owned_by: "mock" }] }));
      return;
    }
    if (req.method === "POST" && url.includes("/chat/completions")) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const id = "chatcmpl-mock";
      const writeChunk = (delta, finish) => {
        res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: MODEL_ID, choices: [{ index: 0, delta, finish_reason: finish ?? null }] })}\n\n`);
      };
      writeChunk({ role: "assistant", content: "" });
      let n = 0;
      const timer = setInterval(() => {
        if (n++ < 80) {
          writeChunk({ content: n % 2 ? " working" : " …" });
          return;
        }
        clearInterval(timer);
        writeChunk({}, "stop");
        res.write("data: [DONE]\n\n");
        res.end();
      }, 700);
      req.on("close", () => clearInterval(timer));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end("{}");
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }) };
}

test.describe("switching session tabs while a turn is streaming", () => {
  test("does not crash the session view when switching tabs mid-stream", async () => {
    test.setTimeout(180_000);
    const port = await freePort();
    const mock = await startMockProvider(port);
    const provider = {
      npm: "@ai-sdk/openai-compatible",
      name: "Mock",
      options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "local" },
      models: { [MODEL_ID]: { name: "Slow Model" } },
    };
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { mock: provider } });
    try {
      const project = path.join(root, "p");
      await mkdir(project, { recursive: true });

      const page = await rendererPage(browser);
      const pageErrors = [];
      page.on("console", msg => { if (msg.type() === "error") pageErrors.push(msg.text()); });
      page.on("pageerror", err => pageErrors.push("pageerror: " + (err?.stack ?? err?.message ?? err)));
      await page.evaluate(async () => {
        await window.api.storeSet("closedcode.global.dat", "layout", JSON.stringify({ chatPanel: { height: 300, opened: true } }));
      });
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      if (!page.url().startsWith("vcc://renderer/index.html")) {
        await page.waitForURL("vcc://renderer/index.html**", { timeout: 60_000 });
      }
      await page.waitForLoadState("domcontentloaded");
      await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, { timeout: 60_000 });

      await gotoProject(page, project);

      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      const errorBoundary = page.getByText("Session view error", { exact: false });
      // While a turn is in flight the send button doubles as a STOP control
      // (aria-label flips to the localized "停止"). That is the robust "streaming"
      // signal (the progress strip is gated behind a setting).
      const stopButton = page.locator('[data-action="prompt-submit"][aria-label="停止"]').first();

      // Select the mock model, then type + send → creates session A and starts
      // the first turn, which our mock streams for ~56s.
      await page.locator('[data-action="prompt-model"]').first().click({ timeout: 30_000 });
      await page.getByText("Slow Model").first().click({ timeout: 15_000 });
      await expect(page.locator('[data-action="prompt-model"]').first()).toContainText("Slow Model", { timeout: 15_000 });

      await page.locator('[data-component="prompt-input"]').first().click();
      await page.keyboard.type("hello there");
      const submit = page.locator('[data-action="prompt-submit"]').first();
      await expect(submit).toBeEnabled({ timeout: 10_000 });
      await submit.click();

      // The turn is now actively STREAMING (thinking) — stop button is visible.
      await expect(stopButton).toBeVisible({ timeout: 30_000 });
      await expect(realTabs).toHaveCount(1, { timeout: 30_000 });
      const firstId = await realTabs.first().getAttribute("data-session-id");
      await expect(errorBoundary).toHaveCount(0);

      // Open a SECOND tab via "+" (switches params.id away from the streaming
      // session A while its parts keep streaming in the background).
      await page.locator('[data-slot="session-new"]').click();
      await expect(realTabs).toHaveCount(2, { timeout: 30_000 });
      await expect(errorBoundary).toHaveCount(0);
      const ids = await realTabs.evaluateAll(els => els.map(e => e.getAttribute("data-session-id")));
      const otherId = ids.find(x => x !== firstId);

      // Rapidly alternate the active tab between the streaming A and the idle B
      // MANY times. The crash needs a params.id flip to coincide with a streaming
      // part delta (mock emits one every ~700ms) inside the same flush wave, so we
      // switch ~10x over several seconds and assert the ErrorBoundary never trips.
      const labelOf = id => page.locator(`[data-slot="session-tab"][data-session-id="${id}"] [data-slot="session-tab-label"]`);
      for (let i = 0; i < 10; i++) {
        const target = i % 2 === 0 ? firstId : otherId;
        // The click may throw if a prior switch already crashed the view (the tab
        // bar gets replaced by the ErrorBoundary div); swallow it so the explicit
        // ErrorBoundary assertion below is what reports the failure.
        await labelOf(target).click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(400);
        if (await errorBoundary.count() > 0) {
          const txt = await errorBoundary.first().textContent().catch(() => "(no text)");
          throw new Error(`ErrorBoundary tripped mid-stream (iter ${i}): ${txt}\n--- page errors ---\n${pageErrors.slice(-8).join("\n")}`);
        }
      }

      // A must still have been streaming throughout (else the switches weren't
      // mid-stream): land on A and confirm the stop button is still present.
      await labelOf(firstId).click();
      await expect(stopButton).toBeVisible({ timeout: 10_000 });
      await expect(errorBoundary).toHaveCount(0);
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
      await mock.close();
    }
  });
});
