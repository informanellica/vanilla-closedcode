import { DatabaseSync as Database } from "node:sqlite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import z from "zod";
import { Filesystem } from "@/util/filesystem.js";
const ZedEditorRowSchema = z.object({
  item_kind: z.string(),
  editor_id: z.number().nullable(),
  workspace_id: z.number(),
  workspace_paths: z.string().nullable(),
  timestamp: z.string(),
  buffer_path: z.string().nullable()
});
const ZedSelectionRowSchema = z.object({
  selection_start: z.number().nullable(),
  selection_end: z.number().nullable()
});
const ZedEditorContentsSchema = z.object({
  contents: z.string().nullable()
});
const utf8 = new TextEncoder();
export async function resolveZedSelection(dbPath, cwd = process.cwd()) {
  const active = queryZedActiveEditor(dbPath, cwd);
  if (active.type !== "row") return active;
  const row = active.row;
  if (!row.buffer_path) return {
    type: "empty"
  };
  const selections = queryZedEditorSelections(dbPath, row);
  if (selections.type !== "selections") return selections;
  const byteRanges = selections.selections.flatMap(selection => {
    if (selection.selection_start == null || selection.selection_end == null) return [];
    return [{
      start: Math.min(selection.selection_start, selection.selection_end),
      end: Math.max(selection.selection_start, selection.selection_end)
    }];
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  if (byteRanges.length === 0) return {
    type: "unavailable"
  };
  const contents = queryZedEditorContents(dbPath, row);
  const text = contents.type === "contents" && contents.contents != null ? contents.contents : await fs.readFile(row.buffer_path, "utf8").catch(() => undefined);
  if (text == null) return {
    type: "unavailable"
  };
  const ranges = byteRanges.map(range => {
    const startOffset = utf8ByteOffsetToStringIndex(text, range.start);
    const endOffset = utf8ByteOffsetToStringIndex(text, range.end);
    return {
      text: text.slice(startOffset, endOffset),
      selection: offsetsToSelection(text, startOffset, endOffset)
    };
  });
  return {
    type: "selection",
    selection: {
      filePath: row.buffer_path,
      source: "zed",
      ranges
    }
  };
}
function queryZedActiveEditor(dbPath, cwd) {
  let db;
  try {
    db = new Database(dbPath, {
      readOnly: true
    });
    const raw = db.prepare(`select
          i.kind as item_kind,
          e.item_id as editor_id,
          i.workspace_id as workspace_id,
          w.paths as workspace_paths,
          w.timestamp as timestamp,
          e.buffer_path as buffer_path
        from items i
        join panes p on p.pane_id = i.pane_id and p.workspace_id = i.workspace_id
        join workspaces w on w.workspace_id = i.workspace_id
        left join editors e on e.item_id = i.item_id and e.workspace_id = i.workspace_id
        where i.active = 1 and p.active = 1
        order by w.timestamp desc`).all();
    const rows = raw.flatMap(row => {
      const parsed = ZedEditorRowSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    if (raw.length > 0 && rows.length === 0) return {
      type: "unavailable"
    };
    const row = rows.map(row => ({
      row,
      score: scoreZedWorkspace(row.workspace_paths, cwd)
    })).filter(entry => entry.score > 0).sort((left, right) => right.score - left.score || right.row.timestamp.localeCompare(left.row.timestamp))[0]?.row;
    if (!row) return {
      type: "empty"
    };
    if (row.item_kind !== "Editor") return {
      type: "unavailable"
    };
    if (!isZedActiveEditorRow(row)) return {
      type: "empty"
    };
    return {
      type: "row",
      row
    };
  } catch {
    return {
      type: "unavailable"
    };
  } finally {
    db?.close();
  }
}
function queryZedEditorSelections(dbPath, row) {
  let db;
  try {
    db = new Database(dbPath, {
      readOnly: true
    });
    const raw = db.prepare(`select
          start as selection_start,
          end as selection_end
        from editor_selections
        where editor_id = $editorID and workspace_id = $workspaceID`).all({
      $editorID: row.editor_id,
      $workspaceID: row.workspace_id
    });
    const selections = raw.flatMap(selection => {
      const parsed = ZedSelectionRowSchema.safeParse(selection);
      return parsed.success ? [parsed.data] : [];
    });
    if (raw.length > 0 && selections.length === 0) return {
      type: "unavailable"
    };
    return {
      type: "selections",
      selections
    };
  } catch {
    return {
      type: "unavailable"
    };
  } finally {
    db?.close();
  }
}
function queryZedEditorContents(dbPath, row) {
  let db;
  try {
    db = new Database(dbPath, {
      readOnly: true
    });
    const parsed = ZedEditorContentsSchema.safeParse(db.prepare(`select contents
        from editors
        where item_id = $editorID and workspace_id = $workspaceID`).get({
      $editorID: row.editor_id,
      $workspaceID: row.workspace_id
    }));
    if (!parsed.success) return {
      type: "unavailable"
    };
    return {
      type: "contents",
      contents: parsed.data.contents
    };
  } catch {
    return {
      type: "unavailable"
    };
  } finally {
    db?.close();
  }
}
function isZedActiveEditorRow(row) {
  return row.item_kind === "Editor" && row.editor_id != null;
}
export function resolveZedDbPath() {
  const candidates = [process.env.CLOSEDCODE_ZED_DB, path.join(os.homedir(), "Library", "Application Support", "Zed", "db", "0-stable", "db.sqlite"), path.join(os.homedir(), ".local", "share", "zed", "db", "0-stable", "db.sqlite")].filter(item => Boolean(item));
  return candidates.find(item => isFile(item));
}
function isFile(item) {
  try {
    return Filesystem.stat(item)?.isFile() === true;
  } catch {
    return false;
  }
}
function scoreZedWorkspace(workspacePaths, cwd) {
  return zedWorkspacePaths(workspacePaths).reduce((score, item) => {
    if (pathContains(item, cwd)) return Math.max(score, path.resolve(item).length);
    return score;
  }, 0);
}
function zedWorkspacePaths(value) {
  if (!value) return [];
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed.filter(item => typeof item === "string");
  return value.split(/\r?\n/).filter(Boolean);
}
export function offsetToPosition(text, offset) {
  const stringOffset = utf8ByteOffsetToStringIndex(text, offset);
  return offsetsToSelection(text, stringOffset, stringOffset).start;
}
function utf8ByteOffsetToStringIndex(text, byteOffset) {
  if (byteOffset <= 0) return 0;
  let bytes = 0;
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) return text.length;
    const nextIndex = index + (codePoint > 0xffff ? 2 : 1);
    bytes += utf8.encode(text.slice(index, nextIndex)).length;
    if (bytes >= byteOffset) return nextIndex;
    index = nextIndex;
  }
  return text.length;
}
function offsetsToSelection(text, startOffset, endOffset) {
  const start = Math.max(0, Math.min(startOffset, text.length));
  const end = Math.max(0, Math.min(endOffset, text.length));
  let line = 1;
  let lineStart = 0;
  let startPosition = position(line, lineStart, start);
  let endPosition = position(line, lineStart, end);
  for (let index = 0; index <= end; index++) {
    if (index === start) startPosition = position(line, lineStart, index);
    if (index === end) {
      endPosition = position(line, lineStart, index);
      break;
    }
    if (text[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }
  return {
    start: startPosition,
    end: endPosition
  };
}
function position(line, lineStart, offset) {
  return {
    line,
    character: offset - lineStart + 1
  };
}
function pathContains(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return;
  }
}