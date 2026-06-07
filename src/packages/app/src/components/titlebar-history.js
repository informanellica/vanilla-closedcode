export const MAX_TITLEBAR_HISTORY = 100;
export function applyPath(state, current, max = MAX_TITLEBAR_HISTORY) {
  if (!state.stack.length) {
    const stack = current === "/" ? ["/"] : ["/", current];
    return {
      stack,
      index: stack.length - 1,
      action: undefined
    };
  }
  const active = state.stack[state.index];
  if (current === active) {
    if (!state.action) return state;
    return {
      ...state,
      action: undefined
    };
  }
  if (state.action) return {
    ...state,
    action: undefined
  };
  return pushPath(state, current, max);
}
export function pushPath(state, path, max = MAX_TITLEBAR_HISTORY) {
  const stack = state.stack.slice(0, state.index + 1).concat(path);
  const next = trimHistory(stack, stack.length - 1, max);
  return {
    ...state,
    ...next,
    action: undefined
  };
}
export function trimHistory(stack, index, max = MAX_TITLEBAR_HISTORY) {
  if (stack.length <= max) return {
    stack,
    index
  };
  const cut = stack.length - max;
  return {
    stack: stack.slice(cut),
    index: Math.max(0, index - cut)
  };
}
export function backPath(state) {
  if (state.index <= 0) return;
  const index = state.index - 1;
  const to = state.stack[index];
  if (!to) return;
  return {
    state: {
      ...state,
      index,
      action: "back"
    },
    to
  };
}
export function forwardPath(state) {
  if (state.index >= state.stack.length - 1) return;
  const index = state.index + 1;
  const to = state.stack[index];
  if (!to) return;
  return {
    state: {
      ...state,
      index,
      action: "forward"
    },
    to
  };
}