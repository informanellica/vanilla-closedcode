import { assetText } from "#util/asset.js";
import { Schema } from "effect";
import * as path from "path";
import { Effect } from "effect";
import * as Tool from "./tool.js";
import { LSP } from "#lsp/lsp.js";
import { createTwoFilesPatch } from "diff";
const DESCRIPTION = assetText("tool/write.txt");
import { Bus } from "../bus/index.js";
import { File } from "../file/index.js";
import { FileWatcher } from "../file/watcher.js";
import { Format } from "../format/index.js";
import { AppFileSystem } from "core/filesystem";
import { InstanceState } from "#effect/instance-state.js";
import { trimDiff } from "./edit.js";
import { assertExternalDirectoryEffect } from "./external-directory.js";
import * as Bom from "#util/bom.js";
const MAX_PROJECT_DIAGNOSTICS_FILES = 5;
export const Parameters = Schema.Struct({
  content: Schema.String.annotate({
    description: "The content to write to the file"
  }),
  filePath: Schema.String.annotate({
    description: "The absolute path to the file to write (must be absolute, not relative)"
  })
});
export const WriteTool = Tool.define("write", Effect.gen(function* () {
  const lsp = yield* LSP.Service;
  const fs = yield* AppFileSystem.Service;
  const bus = yield* Bus.Service;
  const format = yield* Format.Service;
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params, ctx) => Effect.gen(function* () {
      const instance = yield* InstanceState.context;
      const filepath = path.isAbsolute(params.filePath) ? params.filePath : path.join(instance.directory, params.filePath);
      yield* assertExternalDirectoryEffect(ctx, filepath);
      const exists = yield* fs.existsSafe(filepath);
      const source = exists ? yield* Bom.readFile(fs, filepath) : {
        bom: false,
        text: ""
      };
      const next = Bom.split(params.content);
      const desiredBom = source.bom || next.bom;
      const contentOld = source.text;
      const contentNew = next.text;
      const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew));
      yield* ctx.ask({
        permission: "edit",
        patterns: [path.relative(instance.worktree, filepath)],
        always: ["*"],
        metadata: {
          filepath,
          diff
        }
      });
      yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom));
      if (yield* format.file(filepath)) {
        yield* Bom.syncFile(fs, filepath, desiredBom);
      }
      yield* bus.publish(File.Event.Edited, {
        file: filepath
      });
      yield* bus.publish(FileWatcher.Event.Updated, {
        file: filepath,
        event: exists ? "change" : "add"
      });
      let output = "Wrote file successfully.";
      yield* lsp.touchFile(filepath, "document");
      const diagnostics = yield* lsp.diagnostics();
      const normalizedFilepath = AppFileSystem.normalizePath(filepath);
      let projectDiagnosticsCount = 0;
      for (const [file, issues] of Object.entries(diagnostics)) {
        const current = file === normalizedFilepath;
        if (!current && projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue;
        const block = LSP.Diagnostic.report(current ? filepath : file, issues);
        if (!block) continue;
        if (current) {
          output += `\n\nLSP errors detected in this file, please fix:\n${block}`;
          continue;
        }
        projectDiagnosticsCount++;
        output += `\n\nLSP errors detected in other files:\n${block}`;
      }
      return {
        title: path.relative(instance.worktree, filepath),
        metadata: {
          diagnostics,
          filepath,
          exists: exists
        },
        output
      };
    }).pipe(Effect.orDie)
  };
}));