const disposers = new Set();
export function registerDisposer(disposer) {
  disposers.add(disposer);
  return () => {
    disposers.delete(disposer);
  };
}
export async function disposeInstance(directory) {
  await Promise.allSettled([...disposers].map(disposer => disposer(directory)));
}