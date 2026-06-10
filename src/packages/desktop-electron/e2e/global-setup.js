// Warm-up boot before the suite. The first import of a freshly rebuilt sidecar
// bundle (packages/closedcode/dist/node/node.js) is slow — AV scan + parsing a
// very large file — and randomly stalled individual specs at loading.html for
// minutes right after a rebuild. Boot the app once, patiently, and throw the
// instance away so the cold cost is paid here instead of inside a test.
import { killAndWait, launchDesktopWithConfig, rendererPage, rmWithRetry } from "./helpers.js";

export default async function globalSetup() {
  let handle;
  try {
    handle = await launchDesktopWithConfig({});
    await rendererPage(handle.browser);
    console.log("[global-setup] warm-up boot finished");
  } catch (error) {
    // Warm-up is best effort; a failure here should not block the suite.
    console.warn("[global-setup] warm-up boot did not finish:", error?.message);
  } finally {
    if (handle) {
      await handle.browser?.close().catch(() => {});
      await killAndWait(handle.child);
      await rmWithRetry(handle.root);
    }
  }
}
