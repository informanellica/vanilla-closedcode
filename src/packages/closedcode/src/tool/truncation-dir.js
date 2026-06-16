/** @file Resolves the on-disk directory where full (truncated) tool output is persisted. */
import path from "path";
import { Global } from "core/global";
/** Absolute path to the directory holding persisted full tool output ("tool-output" under the global data path). */
export const TRUNCATION_DIR = path.join(Global.Path.data, "tool-output");