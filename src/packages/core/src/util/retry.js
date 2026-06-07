const TRANSIENT_MESSAGES = ["load failed", "network connection was lost", "network request failed", "failed to fetch", "econnreset", "econnrefused", "etimedout", "socket hang up"];
function isTransientError(error) {
  if (!error) return false;
  // oxlint-disable-next-line no-base-to-string -- error is unknown, intentional coercion for message matching
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return TRANSIENT_MESSAGES.some(m => message.includes(m));
}
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