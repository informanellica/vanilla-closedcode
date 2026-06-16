/** @file Tunable constants shared by the global-sync directory and session caches (store cap, idle TTL, recency window and limit). */
/** Maximum number of per-directory stores kept resident before eviction kicks in. */
export const MAX_DIR_STORES = 30;
/** Idle time, in milliseconds, after which a directory store becomes eligible for eviction (20 minutes). */
export const DIR_IDLE_TTL_MS = 20 * 60 * 1000;
/** Recency window, in milliseconds, used when deciding which sessions count as "recent" (4 hours). */
export const SESSION_RECENT_WINDOW = 4 * 60 * 60 * 1000;
/** Maximum number of recent root sessions retained beyond the base trim limit. */
export const SESSION_RECENT_LIMIT = 50;