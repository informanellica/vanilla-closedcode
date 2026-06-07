export function withTimeout(promise, ms) {
  let timeout;
  return Promise.race([promise.finally(() => {
    clearTimeout(timeout);
  }), new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  })]);
}