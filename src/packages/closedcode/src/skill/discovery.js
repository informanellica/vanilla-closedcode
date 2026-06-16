/** @file Remote skill discovery: fetches a skill registry index over HTTP and downloads each skill's files into the local cache. */
import { NodePath } from "@effect/platform-node";
import { Effect, Layer, Path, Schema, Context } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { withTransientReadRetry } from "#util/effect-http-client.js";
import { AppFileSystem } from "core/filesystem";
import { Global } from "core/global";
import * as Log from "core/util/log";
/** Max number of skills downloaded concurrently. */
const skillConcurrency = 4;
/** Max number of files downloaded concurrently per skill. */
const fileConcurrency = 8;
/** Schema for one entry in a remote skill index: a skill name and its list of relative file paths. */
class IndexSkill extends Schema.Class("IndexSkill")({
  name: Schema.String,
  files: Schema.Array(Schema.String)
}) {}
/** Schema for a remote skill index document: a list of skill entries. */
class Index extends Schema.Class("Index")({
  skills: Schema.Array(IndexSkill)
}) {}
export class Service extends Context.Service()("@closedcode/SkillDiscovery") {}
/**
 * Effect Layer providing the SkillDiscovery service, which pulls a remote skill index and downloads skill files into the local cache directory.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const log = Log.create({
    service: "skill-discovery"
  });
  const fs = yield* AppFileSystem.Service;
  const path = yield* Path.Path;
  const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient));
  const cache = path.join(Global.Path.cache, "skills");
  /**
   * Downloads a single file to `dest`, skipping the fetch when it already exists. Logs and reports failure rather than throwing.
   * @param {string} url - The source URL to download.
   * @param {string} dest - The destination file path.
   * @returns {Promise<boolean>} True on success (or when already present), false when the download failed.
   */
  const download = Effect.fn("Discovery.download")(function* (url, dest) {
    if (yield* fs.exists(dest).pipe(Effect.orDie)) return true;
    return yield* HttpClientRequest.get(url).pipe(http.execute, Effect.flatMap(res => res.arrayBuffer), Effect.flatMap(body => fs.writeWithDirs(dest, new Uint8Array(body))), Effect.as(true), Effect.catch(err => Effect.sync(() => {
      log.error("failed to download", {
        url,
        err
      });
      return false;
    })));
  });
  /**
   * Fetches the skill index at `<url>/index.json`, then for each skill that includes a SKILL.md, downloads all its files into the cache and returns the local directories that ended up with a SKILL.md. Skills missing SKILL.md (in the index or after download) are skipped.
   * @param {string} url - The base URL of the remote skill registry.
   * @returns {Promise<Array<string>>} The local cache directories for successfully pulled skills.
   */
  const pull = Effect.fn("Discovery.pull")(function* (url) {
    const base = url.endsWith("/") ? url : `${url}/`;
    const index = new URL("index.json", base).href;
    const host = base.slice(0, -1);
    log.info("fetching index", {
      url: index
    });
    const data = yield* HttpClientRequest.get(index).pipe(HttpClientRequest.acceptJson, http.execute, Effect.flatMap(HttpClientResponse.schemaBodyJson(Index)), Effect.catch(err => Effect.sync(() => {
      log.error("failed to fetch index", {
        url: index,
        err
      });
      return null;
    })));
    if (!data) return [];
    const list = data.skills.filter(skill => {
      if (!skill.files.includes("SKILL.md")) {
        log.warn("skill entry missing SKILL.md", {
          url: index,
          skill: skill.name
        });
        return false;
      }
      return true;
    });
    const dirs = yield* Effect.forEach(list, skill => Effect.gen(function* () {
      const root = path.join(cache, skill.name);
      yield* Effect.forEach(skill.files, file => download(new URL(file, `${host}/${skill.name}/`).href, path.join(root, file)), {
        concurrency: fileConcurrency
      });
      const md = path.join(root, "SKILL.md");
      return (yield* fs.exists(md).pipe(Effect.orDie)) ? root : null;
    }), {
      concurrency: skillConcurrency
    });
    return dirs.filter(dir => dir !== null);
  });
  return Service.of({
    pull
  });
}));
/** The SkillDiscovery layer with all its dependencies (HTTP client, filesystem, path) provided. */
export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(NodePath.layer));
export * as Discovery from "./discovery.js";