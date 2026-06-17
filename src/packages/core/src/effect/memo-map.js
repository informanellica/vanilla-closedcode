/** @file Shared Effect Layer MemoMap so layers built across runtimes are memoized and only constructed once. */
import { Layer } from "effect";
/** Process-wide Effect Layer MemoMap used to deduplicate layer construction across runtimes. */
export const memoMap = Layer.makeMemoMapUnsafe();