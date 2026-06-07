import { BusEvent } from "@/bus/bus-event.js";
import z from "zod";
import { Schema } from "effect";
import { NamedError } from "core/util/error";
import * as Log from "core/util/log";
import { Process } from "@/util/process.js";
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
export const Event = {
  Installed: BusEvent.define("ide.installed", Schema.Struct({
    ide: Schema.String
  }))
};
export const AlreadyInstalledError = NamedError.create("AlreadyInstalledError", z.object({}));
export const InstallFailedError = NamedError.create("InstallFailedError", z.object({
  stderr: z.string()
}));
export function ide() {
  if (process.env["TERM_PROGRAM"] === "vscode") {
    const v = process.env["GIT_ASKPASS"];
    for (const ide of SUPPORTED_IDES) {
      if (v?.includes(ide.name)) return ide.name;
    }
  }
  return "unknown";
}
export function alreadyInstalled() {
  return process.env["CLOSEDCODE_CALLER"] === "vscode" || process.env["CLOSEDCODE_CALLER"] === "vscode-insiders";
}
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