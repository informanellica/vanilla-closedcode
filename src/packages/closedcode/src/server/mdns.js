/** @file mDNS (Bonjour) service advertisement: publish/unpublish the server's HTTP endpoint on the local network. */
import * as Log from "core/util/log";
import { Bonjour } from "bonjour-service";
const log = Log.create({
  service: "mdns"
});
let bonjour;
let currentPort;
/**
 * Publish an mDNS/Bonjour "http" service advertising the server on the local network.
 * No-op if the same port is already published; tears down any prior advertisement first.
 * @param {number} port - TCP port the server is listening on.
 * @param {string} domain - Optional mDNS host name to advertise (defaults to "closedcode.local").
 * @returns {void}
 */
export function publish(port, domain) {
  if (currentPort === port) return;
  if (bonjour) unpublish();
  try {
    const host = domain ?? "closedcode.local";
    const name = `closedcode-${port}`;
    bonjour = new Bonjour();
    const service = bonjour.publish({
      name,
      type: "http",
      host,
      port,
      txt: {
        path: "/"
      }
    });
    service.on("up", () => {
      log.info("mDNS service published", {
        name,
        port
      });
    });
    service.on("error", err => {
      log.error("mDNS service error", {
        error: err
      });
    });
    currentPort = port;
  } catch (err) {
    log.error("mDNS publish failed", {
      error: err
    });
    if (bonjour) {
      try {
        bonjour.destroy();
      } catch {}
    }
    bonjour = undefined;
    currentPort = undefined;
  }
}
/**
 * Tear down the active mDNS/Bonjour advertisement (if any) and reset internal state.
 * @returns {void}
 */
export function unpublish() {
  if (bonjour) {
    try {
      bonjour.unpublishAll();
      bonjour.destroy();
    } catch (err) {
      log.error("mDNS unpublish failed", {
        error: err
      });
    }
    bonjour = undefined;
    currentPort = undefined;
    log.info("mDNS service unpublished");
  }
}
export * as MDNS from "./mdns.js";