/** @file First-party reimplementation of the used subset of @thisbeyond/solid-dnd: pointer-driven sortable drag-and-drop primitives (context, sensors, draggable/droppable/sortable, overlay) for tabs and sidebar reordering. */
// First-party reimplementation of the used subset of @thisbeyond/solid-dnd
// (v0.7.5). Behavior is reproduced faithfully for the features this app relies
// on: a pointer-driven sortable drag-and-drop (session tabs, terminal tabs,
// project/workspace sidebar).
//
// Port/derivative of @thisbeyond/solid-dnd (MIT License,
// Copyright (c) 2021 Martin Pengelly-Phillips). See THIRD-PARTY-NOTICES.md.
//
// Reactivity is sourced ONLY from "../reactivity.js" / "solid-js/store". The upstream
// DragOverlay used Portal from "../reactivity.js"; here the overlay element is
// appended to document.body manually (mount + onCleanup) to avoid that import,
// which is equivalent to <Portal mount={document.body}> for a single element.
import {
  batch,
  children,
  createComponent,
  createContext,
  createEffect,
  createSignal,
  mergeProps,
  onCleanup,
  onMount,
  untrack,
  useContext
} from "../reactivity.js";
import { createStore } from "../store.js";

// ---------------------------------------------------------------------------
// Layout geometry (src/layout.ts)
// ---------------------------------------------------------------------------

/**
 * Floored rectangle geometry with derived edge/center/corner accessors. Mirrors
 * upstream solid-dnd's Layout.
 */
class Layout {
  /**
   * @param {Object} rect - A rect-like with `x`, `y`, `width`, `height`.
   */
  constructor(rect) {
    this.x = Math.floor(rect.x);
    this.y = Math.floor(rect.y);
    this.width = Math.floor(rect.width);
    this.height = Math.floor(rect.height);
  }
  get rect() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  get left() {
    return this.x;
  }
  get top() {
    return this.y;
  }
  get right() {
    return this.x + this.width;
  }
  get bottom() {
    return this.y + this.height;
  }
  get center() {
    return {
      x: this.x + this.width * 0.5,
      y: this.y + this.height * 0.5
    };
  }
  get corners() {
    return {
      topLeft: { x: this.left, y: this.top },
      topRight: { x: this.right, y: this.top },
      bottomRight: { x: this.left, y: this.bottom },
      bottomLeft: { x: this.right, y: this.bottom }
    };
  }
}

/**
 * Measure an element, then strip any CSS translate so the recorded layout is
 * the untransformed (resting) position. Mirrors elementLayout/stripTransform.
 * @param {HTMLElement} element - The element to measure.
 * @returns {Layout} The element's untransformed layout.
 */
const elementLayout = (element) => {
  let layout = new Layout(element.getBoundingClientRect());
  const { transform } = getComputedStyle(element);
  if (transform) {
    layout = stripTransformFromLayout(layout, transform);
  }
  return layout;
};

/**
 * Subtract a CSS transform's translate component from a layout's position.
 * @param {Layout} layout - The measured layout.
 * @param {string} transform - The computed CSS `transform` value.
 * @returns {Layout} A new layout offset back to its untransformed position.
 */
const stripTransformFromLayout = (layout, transform) => {
  let translateX, translateY;
  if (transform.startsWith("matrix3d(")) {
    const matrix = transform.slice(9, -1).split(/, /);
    translateX = +matrix[12];
    translateY = +matrix[13];
  } else if (transform.startsWith("matrix(")) {
    const matrix = transform.slice(7, -1).split(/, /);
    translateX = +matrix[4];
    translateY = +matrix[5];
  } else {
    translateX = 0;
    translateY = 0;
  }
  return new Layout({
    ...layout,
    x: layout.x - translateX,
    y: layout.y - translateY
  });
};

/**
 * The identity transform.
 * @returns {Object} `{ x: 0, y: 0 }`.
 */
const noopTransform = () => ({ x: 0, y: 0 });

/**
 * Whether two transforms have the same x/y.
 * @param {Object} firstTransform - A transform with `x` and `y`.
 * @param {Object} secondTransform - A transform with `x` and `y`.
 * @returns {boolean} True when both components are equal.
 */
const transformsAreEqual = (firstTransform, secondTransform) => {
  return (
    firstTransform.x === secondTransform.x &&
    firstTransform.y === secondTransform.y
  );
};

/**
 * Apply a transform's translate to a layout's position.
 * @param {Layout} layout - The base layout.
 * @param {Object} transform - A transform with `x` and `y`.
 * @returns {Layout} A new translated layout.
 */
const transformLayout = (layout, transform) => {
  return new Layout({
    ...layout,
    x: layout.x + transform.x,
    y: layout.y + transform.y
  });
};

/**
 * Euclidean distance between two points.
 * @param {Object} firstPoint - A point with `x` and `y`.
 * @param {Object} secondPoint - A point with `x` and `y`.
 * @returns {number} The distance.
 */
const distanceBetweenPoints = (firstPoint, secondPoint) => {
  return Math.sqrt(
    Math.pow(firstPoint.x - secondPoint.x, 2) +
      Math.pow(firstPoint.y - secondPoint.y, 2)
  );
};

/**
 * Whether two layouts have identical position and size.
 * @param {Layout} firstLayout - A layout.
 * @param {Layout} secondLayout - A layout.
 * @returns {boolean} True when x/y/width/height all match.
 */
const layoutsAreEqual = (firstLayout, secondLayout) => {
  return (
    firstLayout.x === secondLayout.x &&
    firstLayout.y === secondLayout.y &&
    firstLayout.width === secondLayout.width &&
    firstLayout.height === secondLayout.height
  );
};

// ---------------------------------------------------------------------------
// Collision detection (src/collision.ts) — only closestCenter is consumed.
// ---------------------------------------------------------------------------

/**
 * Collision detector: pick the droppable whose center is closest to the
 * draggable's transformed center (ties favour the currently active droppable).
 * @param {Object} draggable - The active draggable (provides `transformed.center`).
 * @param {Array} droppables - The candidate droppables.
 * @param {Object} context - Has `activeDroppableId` for tie-breaking.
 * @returns {Object} The closest droppable, or null.
 */
const closestCenter = (draggable, droppables, context) => {
  const point1 = draggable.transformed.center;
  const collision = { distance: Infinity, droppable: null };
  for (const droppable of droppables) {
    const distance = distanceBetweenPoints(point1, droppable.layout.center);
    if (distance < collision.distance) {
      collision.distance = distance;
      collision.droppable = droppable;
    } else if (
      distance === collision.distance &&
      droppable.id === context.activeDroppableId
    ) {
      collision.droppable = droppable;
    }
  }
  return collision.droppable;
};

/**
 * Collision detector (default when a provider passes none): pick the droppable
 * with the greatest intersection-over-union with the draggable (ties favour the
 * currently active droppable).
 * @param {Object} draggable - The active draggable (provides `transformed`).
 * @param {Array} droppables - The candidate droppables.
 * @param {Object} context - Has `activeDroppableId` for tie-breaking.
 * @returns {Object} The most-intersecting droppable, or null.
 */
const mostIntersecting = (draggable, droppables, context) => {
  const intersectionRatioOfLayouts = (firstLayout, secondLayout) => {
    const top = Math.max(firstLayout.top, secondLayout.top);
    const left = Math.max(firstLayout.left, secondLayout.left);
    const right = Math.min(firstLayout.right, secondLayout.right);
    const bottom = Math.min(firstLayout.bottom, secondLayout.bottom);
    const width = right - left;
    const height = bottom - top;
    if (left < right && top < bottom) {
      const layout1Area = firstLayout.width * firstLayout.height;
      const layout2Area = secondLayout.width * secondLayout.height;
      const intersectionArea = width * height;
      return intersectionArea / (layout1Area + layout2Area - intersectionArea);
    }
    return 0;
  };
  const draggableLayout = draggable.transformed;
  const collision = { ratio: 0, droppable: null };
  for (const droppable of droppables) {
    const ratio = intersectionRatioOfLayouts(draggableLayout, droppable.layout);
    if (ratio > collision.ratio) {
      collision.ratio = ratio;
      collision.droppable = droppable;
    } else if (
      ratio > 0 &&
      ratio === collision.ratio &&
      droppable.id === context.activeDroppableId
    ) {
      collision.droppable = droppable;
    }
  }
  return collision.droppable;
};

// ---------------------------------------------------------------------------
// Style helpers (src/style.ts)
// ---------------------------------------------------------------------------

/**
 * Build a CSS style object applying a transform as a `translate3d`.
 * @param {Object} transform - A transform with `x` and `y`.
 * @returns {Object} A style object with a `transform` property.
 */
const transformStyle = (transform) => {
  return { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` };
};

// ---------------------------------------------------------------------------
// Drag-drop context (src/drag-drop-context.tsx)
// ---------------------------------------------------------------------------

const Context = createContext();

/**
 * Provider component owning all drag-drop state (draggables, droppables, sensors,
 * the active drag, and the optional overlay) plus the action functions that
 * mutate it. Wires the `onDragStart`/`onDragMove`/`onDragOver`/`onDragEnd`
 * lifecycle callbacks and runs collision detection on move.
 * @param {Object} passedProps - Component props: `collisionDetector` (defaults to mostIntersecting), the `onDrag*` lifecycle callbacks, and `children`.
 * @returns {*} The Context provider wrapping `children`.
 */
const DragDropProvider = (passedProps) => {
  const props = mergeProps(
    { collisionDetector: mostIntersecting },
    passedProps
  );
  const [state, setState] = createStore({
    draggables: {},
    droppables: {},
    sensors: {},
    active: {
      draggableId: null,
      get draggable() {
        return state.active.draggableId !== null
          ? state.draggables[state.active.draggableId]
          : null;
      },
      droppableId: null,
      get droppable() {
        return state.active.droppableId !== null
          ? state.droppables[state.active.droppableId]
          : null;
      },
      sensorId: null,
      get sensor() {
        return state.active.sensorId !== null
          ? state.sensors[state.active.sensorId]
          : null;
      },
      overlay: null
    }
  });

  /**
   * Register a transform contributor on a draggable/droppable (no-op if absent).
   * @param {string} type - "draggables" or "droppables".
   * @param {*} id - The item id.
   * @param {Object} transformer - Has `id`, `order`, and a `callback` transform-mapping function.
   */
  const addTransformer = (type, id, transformer) => {
    if (!untrack(() => state[type][id])) {
      return;
    }
    setState(type, id, "transformers", transformer.id, transformer);
  };

  /**
   * Remove a previously registered transformer (no-op if absent).
   * @param {string} type - "draggables" or "droppables".
   * @param {*} id - The item id.
   * @param {string} transformerId - The transformer's id.
   */
  const removeTransformer = (type, id, transformerId) => {
    if (!untrack(() => state[type][id])) {
      return;
    }
    if (!untrack(() => state[type][id]["transformers"][transformerId])) {
      return;
    }
    setState(type, id, "transformers", transformerId, void 0);
  };

  /**
   * Register (or re-register) a draggable, defining its reactive `transform` /
   * `transformed` accessors. A mid-drag re-registration is pinned in place via a
   * one-shot offset transformer.
   * @param {Object} descriptor - Has `id`, `node`, `layout`, and `data`.
   */
  const addDraggable = ({ id, node, layout, data }) => {
    const existingDraggable = state.draggables[id];
    const draggable = {
      id,
      node,
      layout,
      data,
      pendingCleanup: false
    };
    let transformer;
    if (!existingDraggable) {
      Object.defineProperties(draggable, {
        transformers: {
          enumerable: true,
          configurable: true,
          writable: true,
          value: {}
        },
        transform: {
          enumerable: true,
          configurable: true,
          get: () => {
            if (state.active.overlay) {
              return noopTransform();
            }
            const transformers = Object.values(
              state.draggables[id].transformers
            );
            transformers.sort((a, b) => a.order - b.order);
            return transformers.reduce((transform, transformer2) => {
              return transformer2.callback(transform);
            }, noopTransform());
          }
        },
        transformed: {
          enumerable: true,
          configurable: true,
          get: () => {
            return transformLayout(
              state.draggables[id].layout,
              state.draggables[id].transform
            );
          }
        }
      });
    } else if (state.active.draggableId === id && !state.active.overlay) {
      // The same draggable re-registered mid-drag (e.g. a list reorder swapped
      // its node): keep it visually pinned by offsetting by the layout delta.
      const layoutDelta = {
        x: existingDraggable.layout.x - layout.x,
        y: existingDraggable.layout.y - layout.y
      };
      const transformerId = "addDraggable-existing-offset";
      const existingTransformer = existingDraggable.transformers[transformerId];
      const transformOffset = existingTransformer
        ? existingTransformer.callback(layoutDelta)
        : layoutDelta;
      transformer = {
        id: transformerId,
        order: 100,
        callback: (transform) => {
          return {
            x: transform.x + transformOffset.x,
            y: transform.y + transformOffset.y
          };
        }
      };
      onDragEnd(() => removeTransformer("draggables", id, transformerId));
    }
    batch(() => {
      setState("draggables", id, draggable);
      if (transformer) {
        addTransformer("draggables", id, transformer);
      }
    });
    if (state.active.draggable) {
      recomputeLayouts();
    }
  };

  /**
   * Mark a draggable for deferred cleanup (so a re-register in the same tick can
   * cancel it).
   * @param {*} id - The draggable id.
   */
  const removeDraggable = (id) => {
    if (!untrack(() => state.draggables[id])) {
      return;
    }
    setState("draggables", id, "pendingCleanup", true);
    queueMicrotask(() => cleanupDraggable(id));
  };

  /**
   * Actually delete a draggable if it is still pending cleanup, clearing the
   * active drag when it was the active one.
   * @param {*} id - The draggable id.
   */
  const cleanupDraggable = (id) => {
    if (state.draggables[id]?.pendingCleanup) {
      const cleanupActive = state.active.draggableId === id;
      batch(() => {
        if (cleanupActive) {
          setState("active", "draggableId", null);
        }
        setState("draggables", id, void 0);
      });
    }
  };

  /**
   * Register (or update) a droppable, defining its reactive `transform` /
   * `transformed` accessors on first registration.
   * @param {Object} descriptor - Has `id`, `node`, `layout`, and `data`.
   */
  const addDroppable = ({ id, node, layout, data }) => {
    const existingDroppable = state.droppables[id];
    const droppable = {
      id,
      node,
      layout,
      data,
      pendingCleanup: false
    };
    if (!existingDroppable) {
      Object.defineProperties(droppable, {
        transformers: {
          enumerable: true,
          configurable: true,
          writable: true,
          value: {}
        },
        transform: {
          enumerable: true,
          configurable: true,
          get: () => {
            const transformers = Object.values(
              state.droppables[id].transformers
            );
            transformers.sort((a, b) => a.order - b.order);
            return transformers.reduce((transform, transformer) => {
              return transformer.callback(transform);
            }, noopTransform());
          }
        },
        transformed: {
          enumerable: true,
          configurable: true,
          get: () => {
            return transformLayout(
              state.droppables[id].layout,
              state.droppables[id].transform
            );
          }
        }
      });
    }
    setState("droppables", id, droppable);
    if (state.active.draggable) {
      recomputeLayouts();
    }
  };

  /**
   * Mark a droppable for deferred cleanup.
   * @param {*} id - The droppable id.
   */
  const removeDroppable = (id) => {
    if (!untrack(() => state.droppables[id])) {
      return;
    }
    setState("droppables", id, "pendingCleanup", true);
    queueMicrotask(() => cleanupDroppable(id));
  };

  /**
   * Actually delete a droppable if still pending cleanup, clearing the active
   * droppable when it was the active one.
   * @param {*} id - The droppable id.
   */
  const cleanupDroppable = (id) => {
    if (state.droppables[id]?.pendingCleanup) {
      const cleanupActive = state.active.droppableId === id;
      batch(() => {
        if (cleanupActive) {
          setState("active", "droppableId", null);
        }
        setState("droppables", id, void 0);
      });
    }
  };

  /**
   * Register a sensor with its activator handlers and reactive coordinate
   * tracking (origin/current/delta).
   * @param {Object} descriptor - Has `id` and `activators` (event-type to handler map).
   */
  const addSensor = ({ id, activators }) => {
    setState("sensors", id, {
      id,
      activators,
      coordinates: {
        origin: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        get delta() {
          return {
            x:
              state.sensors[id].coordinates.current.x -
              state.sensors[id].coordinates.origin.x,
            y:
              state.sensors[id].coordinates.current.y -
              state.sensors[id].coordinates.origin.y
          };
        }
      }
    });
  };

  /**
   * Remove a sensor, clearing the active sensor when it was the active one.
   * @param {*} id - The sensor id.
   */
  const removeSensor = (id) => {
    if (!untrack(() => state.sensors[id])) {
      return;
    }
    const cleanupActive = state.active.sensorId === id;
    batch(() => {
      if (cleanupActive) {
        setState("active", "sensorId", null);
      }
      setState("sensors", id, void 0);
    });
  };

  /**
   * Set (or update) the drag overlay element + layout, defining reactive
   * accessors that mirror the active draggable's id/data/transformers.
   * @param {Object} descriptor - Has `node` and `layout`.
   */
  const setOverlay = ({ node, layout }) => {
    const existing = state.active.overlay;
    const overlay = {
      node,
      layout
    };
    if (!existing) {
      Object.defineProperties(overlay, {
        id: {
          enumerable: true,
          configurable: true,
          get: () => state.active.draggable?.id
        },
        data: {
          enumerable: true,
          configurable: true,
          get: () => state.active.draggable?.data
        },
        transformers: {
          enumerable: true,
          configurable: true,
          get: () =>
            Object.fromEntries(
              Object.entries(
                state.active.draggable
                  ? state.active.draggable.transformers
                  : {}
              ).filter(([id]) => id !== "addDraggable-existing-offset")
            )
        },
        transform: {
          enumerable: true,
          configurable: true,
          get: () => {
            const transformers = Object.values(
              state.active.overlay ? state.active.overlay.transformers : []
            );
            transformers.sort((a, b) => a.order - b.order);
            return transformers.reduce((transform, transformer) => {
              return transformer.callback(transform);
            }, noopTransform());
          }
        },
        transformed: {
          enumerable: true,
          configurable: true,
          get: () => {
            return state.active.overlay
              ? transformLayout(
                  state.active.overlay.layout,
                  state.active.overlay.transform
                )
              : new Layout({ x: 0, y: 0, width: 0, height: 0 });
          }
        }
      });
    }
    setState("active", "overlay", overlay);
  };

  /** Clear the active drag overlay. */
  const clearOverlay = () => setState("active", "overlay", null);

  /**
   * Begin tracking a sensor: seed its origin/current coordinates and mark it active.
   * @param {*} id - The sensor id.
   * @param {Object} coordinates - The initial pointer coordinates (`x`, `y`).
   */
  const sensorStart = (id, coordinates) => {
    batch(() => {
      setState("sensors", id, "coordinates", {
        origin: { ...coordinates },
        current: { ...coordinates }
      });
      setState("active", "sensorId", id);
    });
  };

  /**
   * Update the active sensor's current coordinates (drives the drag transform).
   * @param {Object} coordinates - The new pointer coordinates (`x`, `y`).
   */
  const sensorMove = (coordinates) => {
    const sensorId = state.active.sensorId;
    if (!sensorId) {
      return;
    }
    setState("sensors", sensorId, "coordinates", "current", {
      ...coordinates
    });
  };

  /** Clear the active sensor. */
  const sensorEnd = () => setState("active", "sensorId", null);

  /**
   * Build the event listeners that fan a draggable's activation events out to
   * every registered sensor's activators.
   * @param {*} draggableId - The draggable id the listeners belong to.
   * @param {boolean} asHandlers - When true, key listeners as `onEvent` props instead of raw event names.
   * @returns {Object} A map of event name (or `onEvent`) to listener.
   */
  const draggableActivators = (draggableId, asHandlers) => {
    const eventMap = {};
    for (const sensor of Object.values(state.sensors)) {
      if (sensor) {
        for (const [type, activator] of Object.entries(sensor.activators)) {
          eventMap[type] ??= [];
          eventMap[type].push({
            sensor,
            activator
          });
        }
      }
    }
    const listeners = {};
    for (const key in eventMap) {
      let handlerKey = key;
      if (asHandlers) {
        handlerKey = `on${key}`;
      }
      listeners[handlerKey] = (event) => {
        for (const { activator } of eventMap[key]) {
          if (state.active.sensor) {
            break;
          }
          activator(event, draggableId);
        }
      };
    }
    return listeners;
  };

  /**
   * Re-measure every draggable/droppable/overlay node and write back any changed
   * layouts (sharing measurements per node via a cache).
   * @returns {boolean} True when any layout changed.
   */
  const recomputeLayouts = () => {
    let anyLayoutChanged = false;
    const draggables = Object.values(state.draggables);
    const droppables = Object.values(state.droppables);
    const overlay = state.active.overlay;
    batch(() => {
      const cache = new WeakMap();
      for (const draggable of draggables) {
        if (draggable) {
          const currentLayout = draggable.layout;
          if (!cache.has(draggable.node))
            cache.set(draggable.node, elementLayout(draggable.node));
          const layout = cache.get(draggable.node);
          if (!layoutsAreEqual(currentLayout, layout)) {
            setState("draggables", draggable.id, "layout", layout);
            anyLayoutChanged = true;
          }
        }
      }
      for (const droppable of droppables) {
        if (droppable) {
          const currentLayout = droppable.layout;
          if (!cache.has(droppable.node))
            cache.set(droppable.node, elementLayout(droppable.node));
          const layout = cache.get(droppable.node);
          if (!layoutsAreEqual(currentLayout, layout)) {
            setState("droppables", droppable.id, "layout", layout);
            anyLayoutChanged = true;
          }
        }
      }
      if (overlay) {
        const currentLayout = overlay.layout;
        const layout = elementLayout(overlay.node);
        if (!layoutsAreEqual(currentLayout, layout)) {
          setState("active", "overlay", "layout", layout);
          anyLayoutChanged = true;
        }
      }
    });
    return anyLayoutChanged;
  };

  /**
   * Run the configured collision detector against the active draggable/overlay
   * and update the active droppable id when it changes.
   */
  const detectCollisions = () => {
    const draggable = state.active.overlay ?? state.active.draggable;
    if (draggable) {
      const droppable = props.collisionDetector(
        draggable,
        Object.values(state.droppables),
        {
          activeDroppableId: state.active.droppableId
        }
      );
      const droppableId = droppable ? droppable.id : null;
      if (state.active.droppableId !== droppableId) {
        setState("active", "droppableId", droppableId);
      }
    }
  };

  /**
   * Start a drag: re-measure layouts, mark the draggable active, attach the
   * sensor-move transformer, and run initial collision detection.
   * @param {*} draggableId - The id of the draggable being dragged.
   */
  const dragStart = (draggableId) => {
    const transformer = {
      id: "sensorMove",
      order: 0,
      callback: (transform) => {
        if (state.active.sensor) {
          return {
            x: transform.x + state.active.sensor.coordinates.delta.x,
            y: transform.y + state.active.sensor.coordinates.delta.y
          };
        }
        return transform;
      }
    };
    recomputeLayouts();
    batch(() => {
      setState("active", "draggableId", draggableId);
      addTransformer("draggables", draggableId, transformer);
    });
    detectCollisions();
  };

  /**
   * End a drag: detach the sensor-move transformer, clear the active
   * draggable/droppable, and re-measure layouts.
   */
  const dragEnd = () => {
    const draggableId = untrack(() => state.active.draggableId);
    batch(() => {
      if (draggableId !== null) {
        removeTransformer("draggables", draggableId, "sensorMove");
      }
      setState("active", ["draggableId", "droppableId"], null);
    });
    recomputeLayouts();
  };

  /**
   * Register a handler invoked (untracked) whenever a drag begins.
   * @param {Function} handler - Receives `{ draggable }`.
   */
  const onDragStart = (handler) => {
    createEffect(() => {
      const draggable = state.active.draggable;
      if (draggable) {
        untrack(() => handler({ draggable }));
      }
    });
  };

  /**
   * Register a handler invoked on every move of the active drag.
   * @param {Function} handler - Receives `{ draggable, overlay }`.
   */
  const onDragMove = (handler) => {
    createEffect(() => {
      const draggable = state.active.draggable;
      if (draggable) {
        const overlay = untrack(() => state.active.overlay);
        // Touch the live transform so the effect re-runs on every move.
        Object.values(overlay ? overlay.transform : draggable.transform);
        untrack(() => handler({ draggable, overlay }));
      }
    });
  };

  /**
   * Register a handler invoked when the active draggable's droppable changes.
   * @param {Function} handler - Receives `{ draggable, droppable, overlay }`.
   */
  const onDragOver = (handler) => {
    createEffect(() => {
      const draggable = state.active.draggable;
      const droppable = state.active.droppable;
      if (draggable) {
        untrack(() =>
          handler({ draggable, droppable, overlay: state.active.overlay })
        );
      }
    });
  };

  /**
   * Register a handler invoked once when a drag finishes, with the just-ended
   * drag's draggable/droppable/overlay (tracked via the effect's previous value).
   * @param {Function} handler - Receives `{ draggable, droppable, overlay }`.
   */
  const onDragEnd = (handler) => {
    createEffect(
      ({ previousDraggable, previousDroppable, previousOverlay }) => {
        const draggable = state.active.draggable;
        const droppable = draggable ? state.active.droppable : null;
        const overlay = draggable ? state.active.overlay : null;
        if (!draggable && previousDraggable) {
          untrack(() =>
            handler({
              draggable: previousDraggable,
              droppable: previousDroppable,
              overlay: previousOverlay
            })
          );
        }
        return {
          previousDraggable: draggable,
          previousDroppable: droppable,
          previousOverlay: overlay
        };
      },
      {
        previousDraggable: null,
        previousDroppable: null,
        previousOverlay: null
      }
    );
  };

  onDragMove(() => detectCollisions());
  props.onDragStart && onDragStart(props.onDragStart);
  props.onDragMove && onDragMove(props.onDragMove);
  props.onDragOver && onDragOver(props.onDragOver);
  props.onDragEnd && onDragEnd(props.onDragEnd);

  const actions = {
    addTransformer,
    removeTransformer,
    addDraggable,
    removeDraggable,
    addDroppable,
    removeDroppable,
    addSensor,
    removeSensor,
    setOverlay,
    clearOverlay,
    recomputeLayouts,
    detectCollisions,
    draggableActivators,
    sensorStart,
    sensorMove,
    sensorEnd,
    dragStart,
    dragEnd,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd
  };
  const context = [state, actions];
  return createComponent(Context.Provider, {
    value: context,
    get children() {
      return props.children;
    }
  });
};

/**
 * Access the drag-drop context `[state, actions]` tuple.
 * @returns {Array} The `[state, actions]` tuple, or null when outside a provider.
 */
const useDragDropContext = () => {
  return useContext(Context) || null;
};

// ---------------------------------------------------------------------------
// Pointer sensor (src/create-pointer-sensor.ts)
// ---------------------------------------------------------------------------

/**
 * Register a pointer-driven sensor that activates a drag after a short hold
 * (250ms) or once the pointer moves past a threshold (10px), then tracks
 * pointer moves and ends the drag on pointer up. Suppresses text selection
 * while dragging.
 * @param {string} id - The sensor id (default "pointer-sensor").
 */
const createPointerSensor = (id = "pointer-sensor") => {
  const [
    state,
    {
      addSensor,
      removeSensor,
      sensorStart,
      sensorMove,
      sensorEnd,
      dragStart,
      dragEnd
    }
  ] = useDragDropContext();
  const activationDelay = 250;
  const activationDistance = 10;
  onMount(() => {
    addSensor({ id, activators: { pointerdown: attach } });
  });
  onCleanup(() => {
    removeSensor(id);
  });
  const isActiveSensor = () => state.active.sensorId === id;
  const initialCoordinates = { x: 0, y: 0 };
  let activationDelayTimeoutId = null;
  let activationDraggableId = null;
  /**
   * Pointerdown activator: arm the activation hold timer and start listening for
   * move/up (left button only).
   * @param {PointerEvent} event - The pointerdown event.
   * @param {*} draggableId - The draggable id under the pointer.
   */
  const attach = (event, draggableId) => {
    if (event.button !== 0) return;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    activationDraggableId = draggableId;
    initialCoordinates.x = event.clientX;
    initialCoordinates.y = event.clientY;
    activationDelayTimeoutId = window.setTimeout(onActivate, activationDelay);
  };
  /** Tear down the activation timer and all document listeners. */
  const detach = () => {
    if (activationDelayTimeoutId) {
      clearTimeout(activationDelayTimeoutId);
      activationDelayTimeoutId = null;
    }
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("selectionchange", clearSelection);
  };
  /** Promote the armed pointer into an active drag (or detach if another sensor won). */
  const onActivate = () => {
    if (!state.active.sensor) {
      sensorStart(id, initialCoordinates);
      dragStart(activationDraggableId);
      clearSelection();
      document.addEventListener("selectionchange", clearSelection);
    } else if (!isActiveSensor()) {
      detach();
    }
  };
  /**
   * Pointermove handler: activate the drag once past the distance threshold,
   * then forward coordinates while this sensor is active.
   * @param {PointerEvent} event - The pointermove event.
   */
  const onPointerMove = (event) => {
    const coordinates = { x: event.clientX, y: event.clientY };
    if (!state.active.sensor) {
      const transform = {
        x: coordinates.x - initialCoordinates.x,
        y: coordinates.y - initialCoordinates.y
      };
      if (Math.sqrt(transform.x ** 2 + transform.y ** 2) > activationDistance) {
        onActivate();
      }
    }
    if (isActiveSensor()) {
      event.preventDefault();
      sensorMove(coordinates);
    }
  };
  /**
   * Pointerup handler: detach listeners and finish the drag if this sensor was active.
   * @param {PointerEvent} event - The pointerup event.
   */
  const onPointerUp = (event) => {
    detach();
    if (isActiveSensor()) {
      event.preventDefault();
      dragEnd();
      sensorEnd();
    }
  };
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
  };
};

/**
 * Component that registers the default pointer sensor for its subtree.
 * @param {Object} props - Component props (renders `children`).
 * @returns {*} The component's `children`.
 */
const DragDropSensors = (props) => {
  createPointerSensor();
  return props.children;
};

// ---------------------------------------------------------------------------
// Draggable / droppable primitives (src/create-draggable.ts, create-droppable.ts)
// ---------------------------------------------------------------------------

/**
 * Create a draggable primitive: a directive function (usable as `ref`) that
 * registers the element, wires its activation listeners, and applies the live
 * drag transform. Exposes `ref`, `isActiveDraggable`, `dragActivators`, and
 * `transform` accessors.
 * @param {*} id - The draggable id.
 * @param {Object} data - Arbitrary data attached to the draggable (default {}).
 * @returns {Function} The draggable directive (with attached accessor properties).
 */
const createDraggable = (id, data = {}) => {
  const [state, { addDraggable, removeDraggable, draggableActivators }] =
    useDragDropContext();
  const [node, setNode] = createSignal(null);
  onMount(() => {
    const resolvedNode = node();
    if (resolvedNode) {
      addDraggable({
        id,
        node: resolvedNode,
        layout: elementLayout(resolvedNode),
        data
      });
    }
  });
  onCleanup(() => removeDraggable(id));
  const isActiveDraggable = () => state.active.draggableId === id;
  const transform = () => {
    return state.draggables[id]?.transform || noopTransform();
  };
  const draggable = Object.defineProperties(
    (element, accessor) => {
      const config = accessor ? accessor() : {};
      createEffect(() => {
        const resolvedNode = node();
        const activators = draggableActivators(id);
        if (resolvedNode) {
          for (const key in activators) {
            resolvedNode.addEventListener(key, activators[key]);
          }
        }
        onCleanup(() => {
          if (resolvedNode) {
            for (const key in activators) {
              resolvedNode.removeEventListener(key, activators[key]);
            }
          }
        });
      });
      setNode(element);
      if (!config.skipTransform) {
        createEffect(() => {
          const resolvedTransform = transform();
          if (!transformsAreEqual(resolvedTransform, noopTransform())) {
            const style = transformStyle(transform());
            element.style.setProperty("transform", style.transform ?? null);
          } else {
            element.style.removeProperty("transform");
          }
        });
      }
    },
    {
      ref: {
        enumerable: true,
        value: setNode
      },
      isActiveDraggable: {
        enumerable: true,
        get: isActiveDraggable
      },
      dragActivators: {
        enumerable: true,
        get: () => {
          return draggableActivators(id, true);
        }
      },
      transform: {
        enumerable: true,
        get: transform
      }
    }
  );
  return draggable;
};

/**
 * Create a droppable primitive: a directive function (usable as `ref`) that
 * registers the element and applies its transform. Exposes `ref`,
 * `isActiveDroppable`, and `transform` accessors.
 * @param {*} id - The droppable id.
 * @param {Object} data - Arbitrary data attached to the droppable (default {}).
 * @returns {Function} The droppable directive (with attached accessor properties).
 */
const createDroppable = (id, data = {}) => {
  const [state, { addDroppable, removeDroppable }] = useDragDropContext();
  const [node, setNode] = createSignal(null);
  onMount(() => {
    const resolvedNode = node();
    if (resolvedNode) {
      addDroppable({
        id,
        node: resolvedNode,
        layout: elementLayout(resolvedNode),
        data
      });
    }
  });
  onCleanup(() => removeDroppable(id));
  const isActiveDroppable = () => state.active.droppableId === id;
  const transform = () => {
    return state.droppables[id]?.transform || noopTransform();
  };
  const droppable = Object.defineProperties(
    (element, accessor) => {
      const config = accessor ? accessor() : {};
      setNode(element);
      if (!config.skipTransform) {
        createEffect(() => {
          const resolvedTransform = transform();
          if (!transformsAreEqual(resolvedTransform, noopTransform())) {
            const style = transformStyle(transform());
            element.style.setProperty("transform", style.transform ?? null);
          } else {
            element.style.removeProperty("transform");
          }
        });
      }
    },
    {
      ref: {
        enumerable: true,
        value: setNode
      },
      isActiveDroppable: {
        enumerable: true,
        get: isActiveDroppable
      },
      transform: {
        enumerable: true,
        get: transform
      }
    }
  );
  return droppable;
};

// ---------------------------------------------------------------------------
// Drag overlay (src/drag-overlay.tsx)
//
// Upstream wrapped the overlay in <Portal mount={document.body}>. Here the
// Show subtree is built and appended to document.body manually, then removed
// on cleanup — equivalent for a single element and avoids "solid-js/web".
// ---------------------------------------------------------------------------

/**
 * Drag overlay component. Mounts a host element on document.body for its
 * lifetime (equivalent to a Portal), reactively styles it to follow the active
 * drag, and renders `children` (a node or a render function receiving the active
 * draggable) into it only while a drag is active. Renders null in-flow.
 * @param {Object} props - Component props: `class`, `style`, and `children` (node or render function).
 * @returns {null} Always null (the overlay lives on document.body).
 */
const DragOverlay = (props) => {
  const [state, { onDragStart, onDragEnd, setOverlay, clearOverlay }] =
    useDragDropContext();
  let node;
  onDragStart(({ draggable }) => {
    setOverlay({
      node: draggable.node,
      layout: draggable.layout
    });
    queueMicrotask(() => {
      if (node) {
        const layout = elementLayout(node);
        const delta = {
          x: (draggable.layout.width - layout.width) / 2,
          y: (draggable.layout.height - layout.height) / 2
        };
        layout.x += delta.x;
        layout.y += delta.y;
        setOverlay({ node, layout });
      }
    });
  });
  onDragEnd(() => queueMicrotask(clearOverlay));
  const style = () => {
    const overlay = state.active.overlay;
    const draggable = state.active.draggable;
    if (!overlay || !draggable) return {};
    return {
      position: "fixed",
      transition: "transform 0s",
      top: `${overlay.layout.top}px`,
      left: `${overlay.layout.left}px`,
      "min-width": `${draggable.layout.width}px`,
      "min-height": `${draggable.layout.height}px`,
      ...transformStyle(overlay.transform),
      ...props.style
    };
  };

  // Persistent overlay host, body-mounted for the component's lifetime — this
  // mirrors <Portal mount={document.body}>. The inner <Show> (active draggable
  // gate) is reproduced by toggling the host's content/visibility reactively.
  const host = document.createElement("div");
  node = host;
  if (props.class != null) host.setAttribute("class", props.class);
  onMount(() => {
    document.body.appendChild(host);
  });
  onCleanup(() => {
    host.remove();
  });

  // Reactive style binding (replaces the compiled style={} attribute). Keys
  // that drop out of the object are removed from the element.
  createEffect(() => {
    const next = style() || {};
    const prev = host.__dndStyle || {};
    for (const key in prev) {
      if (!(key in next)) host.style.removeProperty(key);
    }
    for (const key in next) {
      host.style.setProperty(key, String(next[key]));
    }
    host.__dndStyle = next;
  });

  // <Show when={active.draggable}> gate. children may be a render function
  // (receives the active draggable) or ready-made component/node output.
  // Resolved through the `children` helper so reactive children stay live.
  const resolved = children(() => {
    if (!state.active.draggable) return null;
    return typeof props.children === "function"
      ? props.children(state.active.draggable)
      : props.children;
  });
  createEffect(() => {
    const value = resolved();
    host.textContent = "";
    appendValue(host, value);
  });

  // Returning null keeps the overlay strictly body-mounted (it has no place in
  // the in-flow tree), exactly like the original Portal-based component.
  return null;
};

/**
 * Append resolved value(s) into a parent. Mirrors how solid insert() flattens
 * arrays/accessors of nodes and primitives (ignoring null/booleans).
 * @param {Node} parent - The parent element to append into.
 * @param {*} value - A node, primitive, array, or accessor function of values.
 */
const appendValue = (parent, value) => {
  if (value == null || value === false || value === true) return;
  if (Array.isArray(value)) {
    for (const item of value) appendValue(parent, item);
    return;
  }
  if (typeof value === "function") {
    appendValue(parent, value());
    return;
  }
  if (value instanceof Node) {
    parent.appendChild(value);
    return;
  }
  parent.appendChild(document.createTextNode(String(value)));
};

// ---------------------------------------------------------------------------
// Sortable context (src/sortable-context.tsx)
// ---------------------------------------------------------------------------

/**
 * Return a copy of an array with one item moved to a new index.
 * @param {Array} array - The source array.
 * @param {number} fromIndex - The item's current index.
 * @param {number} toIndex - The target index.
 * @returns {Array} A new reordered array.
 */
const moveArrayItem = (array, fromIndex, toIndex) => {
  const newArray = array.slice();
  newArray.splice(toIndex, 0, ...newArray.splice(fromIndex, 1));
  return newArray;
};

const SortableContext = createContext();

/**
 * Provider that maintains a sortable ordering for a list of ids, deriving a
 * live `sortedIds` order from the active drag (moving the dragged id toward the
 * hovered droppable's slot) and resetting to `props.ids` otherwise.
 * @param {Object} props - Component props: `ids` (the ordered id list) and `children`.
 * @returns {*} The SortableContext provider wrapping `children`.
 */
const SortableProvider = (props) => {
  const [dndState] = useDragDropContext();
  const [state, setState] = createStore({
    initialIds: [],
    sortedIds: []
  });
  const isValidIndex = (index) => {
    return index >= 0 && index < state.initialIds.length;
  };
  createEffect(() => {
    setState("initialIds", [...props.ids]);
    setState("sortedIds", [...props.ids]);
  });
  createEffect(() => {
    if (dndState.active.draggableId && dndState.active.droppableId) {
      untrack(() => {
        const fromIndex = state.sortedIds.indexOf(dndState.active.draggableId);
        const toIndex = state.initialIds.indexOf(dndState.active.droppableId);
        if (!isValidIndex(fromIndex) || !isValidIndex(toIndex)) {
          setState("sortedIds", [...props.ids]);
        } else if (fromIndex !== toIndex) {
          const resorted = moveArrayItem(state.sortedIds, fromIndex, toIndex);
          setState("sortedIds", resorted);
        }
      });
    } else {
      setState("sortedIds", [...props.ids]);
    }
  });
  const actions = {};
  const context = [state, actions];
  return createComponent(SortableContext.Provider, {
    value: context,
    get children() {
      return props.children;
    }
  });
};

/**
 * Access the sortable context `[state, actions]` tuple.
 * @returns {Array} The `[state, actions]` tuple, or null when outside a SortableProvider.
 */
const useSortableContext = () => {
  return useContext(SortableContext) || null;
};

// ---------------------------------------------------------------------------
// createSortable (src/create-sortable.ts + combine-refs.ts)
// ---------------------------------------------------------------------------

/**
 * Combine two ref setters into one that forwards the element to both.
 * @param {Function} setRefA - The first ref setter.
 * @param {Function} setRefB - The second ref setter.
 * @returns {Function} A single ref setter calling both.
 */
const combineRefs = (setRefA, setRefB) => {
  return (ref) => {
    setRefA(ref);
    setRefB(ref);
  };
};

/**
 * Create a sortable primitive combining a draggable + droppable on one element.
 * Within a SortableProvider it animates non-active items toward their sorted
 * slot (layout-delta offset) while the active item follows the sensor. Returns a
 * directive (usable as `ref`) exposing `ref`, `transform`, `isActiveDraggable`,
 * `dragActivators`, and `isActiveDroppable`.
 * @param {*} id - The sortable item id.
 * @param {Object} data - Arbitrary data attached to the item (default {}).
 * @returns {Function} The sortable directive (with attached accessor properties).
 */
const createSortable = (id, data = {}) => {
  const [dndState, { addTransformer, removeTransformer }] =
    useDragDropContext();
  const [sortableState] = useSortableContext();
  const draggable = createDraggable(id, data);
  const droppable = createDroppable(id, data);
  const setNode = combineRefs(draggable.ref, droppable.ref);
  const initialIndex = () => sortableState.initialIds.indexOf(id);
  const currentIndex = () => sortableState.sortedIds.indexOf(id);
  const layoutById = (id2) => dndState.droppables[id2]?.layout || null;
  // Shift this item to the slot its sorted index points at: the layout-space
  // delta between its resting cell and the target cell drives the transition.
  const sortedTransform = () => {
    const delta = noopTransform();
    const resolvedInitialIndex = initialIndex();
    const resolvedCurrentIndex = currentIndex();
    if (resolvedCurrentIndex !== resolvedInitialIndex) {
      const currentLayout = layoutById(id);
      const targetLayout = layoutById(
        sortableState.initialIds[resolvedCurrentIndex]
      );
      if (currentLayout && targetLayout) {
        delta.x = targetLayout.x - currentLayout.x;
        delta.y = targetLayout.y - currentLayout.y;
      }
    }
    return delta;
  };
  const transformer = {
    id: "sortableOffset",
    order: 100,
    callback: (transform2) => {
      const delta = sortedTransform();
      return { x: transform2.x + delta.x, y: transform2.y + delta.y };
    }
  };
  onMount(() => addTransformer("droppables", id, transformer));
  onCleanup(() => removeTransformer("droppables", id, transformer.id));
  // The active draggable reads its own draggable transform (sensor-driven);
  // every other item reads its droppable transform (the sort offset).
  const transform = () => {
    return (
      (id === dndState.active.draggableId && !dndState.active.overlay
        ? dndState.draggables[id]?.transform
        : dndState.droppables[id]?.transform) || noopTransform()
    );
  };
  const sortable = Object.defineProperties(
    (element) => {
      draggable(element, () => ({ skipTransform: true }));
      droppable(element, () => ({ skipTransform: true }));
      createEffect(() => {
        const resolvedTransform = transform();
        if (!transformsAreEqual(resolvedTransform, noopTransform())) {
          const style = transformStyle(transform());
          element.style.setProperty("transform", style.transform ?? null);
        } else {
          element.style.removeProperty("transform");
        }
      });
    },
    {
      ref: {
        enumerable: true,
        value: setNode
      },
      transform: {
        enumerable: true,
        get: transform
      },
      isActiveDraggable: {
        enumerable: true,
        get: () => draggable.isActiveDraggable
      },
      dragActivators: {
        enumerable: true,
        get: () => draggable.dragActivators
      },
      isActiveDroppable: {
        enumerable: true,
        get: () => droppable.isActiveDroppable
      }
    }
  );
  return sortable;
};

export {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createDraggable,
  createDroppable,
  createPointerSensor,
  createSortable,
  mostIntersecting,
  transformStyle,
  useDragDropContext,
  useSortableContext
};
