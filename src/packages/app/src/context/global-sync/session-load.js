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
export function estimateRootSessionTotal(input) {
  if (!input.limited) return input.count;
  if (input.count < input.limit) return input.count;
  return input.count + 1;
}