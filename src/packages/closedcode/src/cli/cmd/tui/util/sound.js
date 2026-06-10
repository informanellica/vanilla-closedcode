import { Player } from "cli-sound";
import { mkdirSync, existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Process } from "#util/process.js";
import { which } from "#util/which.js";
const __assetDir = resolve(dirname(fileURLToPath(import.meta.url)), "../asset");
const pulseA = join(__assetDir, "pulse-a.wav");
const pulseB = join(__assetDir, "pulse-b.wav");
const pulseC = join(__assetDir, "pulse-c.wav");
const charge = join(__assetDir, "charge.wav");
const FILE = [pulseA, pulseB, pulseC];
const HUM = charge;
const DIR = join(tmpdir(), "closedcode-sfx");
const LIST = ["ffplay", "mpv", "mpg123", "mpg321", "mplayer", "afplay", "play", "omxplayer", "aplay", "cmdmp3", "cvlc", "powershell.exe"];
function args(kind, file, volume) {
  if (kind === "ffplay") return [kind, "-autoexit", "-nodisp", "-af", `volume=${volume}`, file];
  if (kind === "mpv") return [kind, "--no-video", "--audio-display=no", "--volume", String(Math.round(volume * 100)), file];
  if (kind === "mpg123" || kind === "mpg321") return [kind, "-g", String(Math.round(volume * 100)), file];
  if (kind === "mplayer") return [kind, "-vo", "null", "-volume", String(Math.round(volume * 100)), file];
  if (kind === "afplay" || kind === "omxplayer" || kind === "aplay" || kind === "cmdmp3") return [kind, file];
  if (kind === "play") return [kind, "-v", String(volume), file];
  if (kind === "cvlc") return [kind, `--gain=${volume}`, "--play-and-exit", file];
  return [kind, "-c", `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`];
}
let item;
let kind;
let proc;
let tail;
let cache;
let seq = 0;
let shot = 0;
function load() {
  if (item !== undefined) return item;
  try {
    item = new Player({
      volume: 0.35
    });
  } catch {
    item = null;
  }
  return item;
}
async function file(path) {
  mkdirSync(DIR, {
    recursive: true
  });
  const next = join(DIR, basename(path));
  if (existsSync(next)) return next;
  await copyFile(path, next);
  return next;
}
function asset() {
  cache ??= Promise.all([file(HUM), Promise.all(FILE.map(file))]).then(([hum, pulse]) => ({
    hum,
    pulse
  }));
  return cache;
}
function pick() {
  if (kind !== undefined) return kind;
  kind = LIST.find(item => which(item)) ?? null;
  return kind;
}
function run(file, volume) {
  const kind = pick();
  if (!kind) return;
  return Process.spawn(args(kind, file, volume), {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore"
  });
}
function clear() {
  if (!tail) return;
  clearTimeout(tail);
  tail = undefined;
}
function play(file, volume) {
  const item = load();
  if (!item) return run(file, volume)?.exited;
  return item.play(file, {
    volume
  }).catch(() => run(file, volume)?.exited);
}
export function start() {
  stop();
  const id = ++seq;
  void asset().then(({
    hum
  }) => {
    if (id !== seq) return;
    const next = run(hum, 0.24);
    if (!next) return;
    proc = next;
    void next.exited.then(() => {
      if (id !== seq) return;
      if (proc === next) proc = undefined;
    }, () => {
      if (id !== seq) return;
      if (proc === next) proc = undefined;
    });
  });
}
export function stop(delay = 0) {
  seq++;
  clear();
  if (!proc) return;
  const next = proc;
  if (delay <= 0) {
    proc = undefined;
    void Process.stop(next).catch(() => undefined);
    return;
  }
  tail = setTimeout(() => {
    tail = undefined;
    if (proc === next) proc = undefined;
    void Process.stop(next).catch(() => undefined);
  }, delay);
}
export function pulse(scale = 1) {
  stop(140);
  const index = shot++ % FILE.length;
  void asset().then(({
    pulse
  }) => play(pulse[index], 0.26 + 0.14 * scale)).catch(() => undefined);
}
export function dispose() {
  stop();
}
export * as Sound from "./sound.js";