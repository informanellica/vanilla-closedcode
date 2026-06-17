/** @file Async retry helper with exponential backoff and transient-network-error detection. */
const TRANSIENT_MESSAGES = ["load failed", "network connection was lost", "network request failed", "failed to fetch", "econnreset", "econnrefused", "etimedout", "socket hang up"];
/**
 * Heuristically determines whether an error looks like a transient network failure
 * by matching its lowercased message against a known list of transient phrases.
 * @param {*} error - The error to classify (Error instance or any value).
 * @returns {boolean} True if the error message matches a known transient phrase.
 */
function isTransientError(error) {
  if (!error) return false;
  // oxlint-disable-next-line no-base-to-string -- error is unknown, intentional coercion for message matching
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return TRANSIENT_MESSAGES.some(m => message.includes(m));
}
/**
 * Invokes an async function, retrying on retryable errors with exponential backoff.
 * Rethrows the last error once attempts are exhausted or when the error is not retryable.
 * @param {Function} fn - The async operation to run; called once per attempt.
 * @param {Object} options - Retry configuration.
 * @param {number} options.attempts - Maximum number of attempts. Defaults to 3.
 * @param {number} options.delay - Base delay in milliseconds before the first retry. Defaults to 500.
 * @param {number} options.factor - Multiplier applied to the delay each attempt. Defaults to 2.
 * @param {number} options.maxDelay - Upper bound on the backoff delay in milliseconds. Defaults to 10000.
 * @param {Function} options.retryIf - Predicate deciding whether an error is retryable. Defaults to isTransientError.
 * @returns {Promise<*>} A promise resolving to the function's result.
 */
export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isTransientError
  } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !retryIf(error)) throw error;
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}