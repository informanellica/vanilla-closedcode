export const normalizeWheelDelta = input => {
  if (input.deltaMode === 1) return input.deltaY * 40;
  if (input.deltaMode === 2) return input.deltaY * input.rootHeight;
  return input.deltaY;
};
export const shouldMarkBoundaryGesture = input => {
  const max = input.scrollHeight - input.clientHeight;
  if (max <= 1) return true;
  if (!input.delta) return false;
  if (input.delta < 0) return input.scrollTop + input.delta <= 0;
  const remaining = max - input.scrollTop;
  return input.delta > remaining;
};