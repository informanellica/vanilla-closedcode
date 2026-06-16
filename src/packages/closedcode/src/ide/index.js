/** @file IDE integration: detects which supported editor launched the CLI and installs the editor extension. */
import { BusEvent } from "#bus/bus-event.js";
import z from "zod";
import { Schema } from "effect";
import { NamedError } from "core/util/error";
import * as Log from "core/util/log";
import { Process } from "#util/process.js";
/** Editors recognized for IDE integration, mapping display name to its CLI command. */
const SUPPORTED_IDES = [{
  name: "Windsurf",
  cmd: "windsurf"
}, {
  name: "Visual Studio Code - Insiders",
  cmd: "code-insiders"
}, {
  name: "Visual Studio Code",
  cmd: "code"
}, {
  name: "Cursor",
  cmd: "cursor"
}, {
  name: "VSCodium",
  cmd: "codium"
}];
const log = Log.create({
  service: "ide"
});
/** Bus events emitted by the IDE module (e.g. when the extension is installed). */
export const Event = {
  Installed: BusEvent.define("ide.installed", Schema.Struct({
    ide: Schema.String
  }))
};
/** Error thrown when the editor extension is already installed. */
export const AlreadyInstalledError = NamedError.create("AlreadyInstalledError", z.object({}));
/** Error thrown when installing the editor extension fails, carrying the captured stderr. */
export const InstallFailedError = NamedError.create("InstallFailedError", z.object({
  stderr: z.string()
}));
/**
 * Detect which supported editor launched the current process via environment hints.
 * @returns {string} The matched IDE display name, or "unknown" when not detected.
 */
export function ide() {
  if (process.env["TERM_PROGRAM"] === "vscode") {
    const v = process.env["GIT_ASKPASS"];
    for (const ide of SUPPORTED_IDES) {
      if (v?.includes(ide.name)) return ide.name;
    }
  }
  return "unknown";
}
/**
 * Determine whether the CLI was invoked from within an editor that already has the extension.
 * @returns {boolean} True when the caller is VS Code or VS Code Insiders.
 */
export function alreadyInstalled() {
  return process.env["CLOSEDCODE_CALLER"] === "vscode" || process.env["CLOSEDCODE_CALLER"] === "vscode-insiders";
}
/**
 * Install the editor extension into the given supported IDE via its CLI.
 * @param {string} ide - Display name of a supported IDE.
 * @returns {Promise<void>} Resolves when installation completes.
 * @throws {Error} When the IDE name is unknown.
 * @throws {InstallFailedError} When the install command exits non-zero.
 * @throws {AlreadyInstalledError} When the extension was already installed.
 */
export async function install(ide) {
  const cmd = SUPPORTED_IDES.find(i => i.name === ide)?.cmd;
  if (!cmd) throw new Error(`Unknown IDE: ${ide}`);
  const p = await Process.run([cmd, "--install-extension", "sst-dev.opencode"], {
    nothrow: true
  });
  const stdout = p.stdout.toString();
  const stderr = p.stderr.toString();
  log.info("installed", {
    ide,
    stdout,
    stderr
  });
  if (p.code !== 0) {
    throw new InstallFailedError({
      stderr
    });
  }
  if (stdout.includes("already installed")) {
    throw new AlreadyInstalledError({});
  }
}
export * as Ide from "./index.js";