// First-party reimplementation of the subset of `@solid-primitives/event-bus`
// used by this app: `createGlobalEmitter`.
//
// Imports only from "solid-js". Behavior matches upstream on the real solid-js runtime.
//
// Scope note: the upstream package also exports `createEmitter`, `createEventBus`,
// `createEventHub`, `createEventStack`, and the `EmitterCore`/`EventBusCore` classes.
// Only the internals required by `createGlobalEmitter` are ported here.

import { getOwner, onCleanup } from "solid-js";

// Inlined `tryOnCleanup` (Solid's `onCleanup` without the dev-only out-of-owner warning).
const tryOnCleanup = fn => (getOwner() ? onCleanup(fn) : fn);

// A bus of listeners; `emit` calls each listener with the payload.
class EventBusCore extends Set {
  emit(payload) {
    for (const cb of this) cb(payload);
  }
}

// A map of event name -> EventBusCore.
class EmitterCore extends Map {
  on(event, listener) {
    let bus = this.get(event);
    bus || this.set(event, (bus = new EventBusCore()));
    bus.add(listener);
  }
  off(event, listener) {
    const bus = this.get(event);
    bus?.delete(listener) && !bus.size && this.delete(event);
  }
  emit(event, value) {
    this.get(event)?.emit(value);
  }
}

// Listen to and emit a single stream of events. All listeners are removed on cleanup.
function createEventBus() {
  const bus = new EventBusCore();
  return {
    listen(listener) {
      bus.add(listener);
      return tryOnCleanup(bus.delete.bind(bus, listener));
    },
    emit: bus.emit.bind(bus),
    clear: onCleanup(bus.clear.bind(bus)),
  };
}

// Listen to and emit named events. Per-event listeners are removed on cleanup.
function createEmitter() {
  const emitter = new EmitterCore();
  return {
    on(event, listener) {
      emitter.on(event, listener);
      return tryOnCleanup(emitter.off.bind(emitter, event, listener));
    },
    emit: emitter.emit.bind(emitter),
    clear: onCleanup(emitter.clear.bind(emitter)),
  };
}

/**
 * Create an emitter you can subscribe to per-event (`on`) or globally (`listen`),
 * and `emit` events to. All subscriptions are removed on cleanup.
 *
 * @returns `{ on, listen, emit, clear }`.
 */
export function createGlobalEmitter() {
  const emitter = createEmitter();
  const global = createEventBus();
  return {
    on: emitter.on,
    clear: emitter.clear,
    listen: global.listen,
    emit(name, details) {
      global.emit({ name, details });
      emitter.emit(name, details);
    },
  };
}
