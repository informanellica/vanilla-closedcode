export function selectionFromLines(range) {
  const startLine = Math.min(range.start, range.end);
  const endLine = Math.max(range.start, range.end);
  return {
    startLine,
    endLine,
    startChar: 0,
    endChar: 0
  };
}