/** @file Loading root sessions for a directory with a limited-then-unlimited fallback, plus estimating the total root session count. */
/**
 * List root sessions for a directory, attempting a limited query first and falling back to an unlimited list on failure.
 * @param {Object} input - Loader inputs: {list: Function, directory: *, limit: number}. `list` returns a Promise resolving to {data: Array}.
 * @returns {Promise<Object>} Result {data: Array, limit: number, limited: boolean}; `limited` is false when the fallback ran.
 */
export async function loadRootSessionsWithFallback(input) {
  try {
    const result = await input.list({
      directory: input.directory,
      roots: true,
      limit: input.limit
    });
    return {
      data: result.data,
      limit: input.limit,
      limited: true
    };
  } catch {
    const result = await input.list({
      directory: input.directory,
      roots: true
    });
    return {
      data: result.data,
      limit: input.limit,
      limited: false
    };
  }
}
/**
 * Estimate the total number of root sessions, adding one when a limited query likely truncated the result.
 * @param {Object} input - Estimate inputs: {limited: boolean, count: number, limit: number}.
 * @returns {number} The exact count when unlimited or under the limit, otherwise count + 1 to signal "more".
 */
export function estimateRootSessionTotal(input) {
  if (!input.limited) return input.count;
  if (input.count < input.limit) return input.count;
  return input.count + 1;
}