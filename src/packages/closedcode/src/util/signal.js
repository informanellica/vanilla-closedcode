export function signal() {
  let resolve;
  const promise = new Promise(r => resolve = r);
  return {
    trigger() {
      return resolve();
    },
    wait() {
      return promise;
    }
  };
}