export function createAim(props) {
  const state = {
    locs: [],
    timer: undefined,
    pending: undefined,
    over: undefined,
    last: undefined
  };
  const delay = props.delay ?? 250;
  const max = props.max ?? 4;
  const tolerance = props.tolerance ?? 80;
  const edge = props.edge ?? 18;
  const cancel = () => {
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.timer = undefined;
    state.pending = undefined;
  };
  const reset = () => {
    cancel();
    state.over = undefined;
    state.last = undefined;
    state.locs.length = 0;
  };
  const move = event => {
    if (!props.enabled()) return;
    const el = props.el();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    state.locs.push({
      x,
      y
    });
    if (state.locs.length > max) state.locs.shift();
  };
  const wait = () => {
    if (!props.enabled()) return 0;
    if (!props.active()) return 0;
    const el = props.el();
    if (!el) return 0;
    if (state.locs.length < 2) return 0;
    const rect = el.getBoundingClientRect();
    const loc = state.locs[state.locs.length - 1];
    if (!loc) return 0;
    const prev = state.locs[0] ?? loc;
    if (prev.x < rect.left || prev.x > rect.right || prev.y < rect.top || prev.y > rect.bottom) return 0;
    if (state.last && loc.x === state.last.x && loc.y === state.last.y) return 0;
    if (rect.right - loc.x <= edge) {
      state.last = loc;
      return delay;
    }
    const upper = {
      x: rect.right,
      y: rect.top - tolerance
    };
    const lower = {
      x: rect.right,
      y: rect.bottom + tolerance
    };
    const slope = (a, b) => (b.y - a.y) / (b.x - a.x);
    const decreasing = slope(loc, upper);
    const increasing = slope(loc, lower);
    const prevDecreasing = slope(prev, upper);
    const prevIncreasing = slope(prev, lower);
    if (decreasing < prevDecreasing && increasing > prevIncreasing) {
      state.last = loc;
      return delay;
    }
    state.last = undefined;
    return 0;
  };
  const activate = id => {
    cancel();
    props.onActivate(id);
  };
  const request = id => {
    if (!id) return;
    if (props.active() === id) return;
    if (!props.active()) {
      activate(id);
      return;
    }
    const ms = wait();
    if (ms === 0) {
      activate(id);
      return;
    }
    cancel();
    state.pending = id;
    state.timer = window.setTimeout(() => {
      state.timer = undefined;
      if (state.pending !== id) return;
      state.pending = undefined;
      if (!props.enabled()) return;
      if (!props.active()) return;
      if (state.over !== id) return;
      props.onActivate(id);
    }, ms);
  };
  const enter = (id, event) => {
    if (!props.enabled()) return;
    state.over = id;
    move(event);
    request(id);
  };
  const leave = id => {
    if (state.over === id) state.over = undefined;
    if (state.pending === id) cancel();
  };
  return {
    move,
    enter,
    leave,
    activate,
    request,
    cancel,
    reset
  };
}