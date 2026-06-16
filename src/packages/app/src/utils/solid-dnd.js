/** @file Drag-and-drop helpers: axis-constraint components that lock a draggable's transform to a single axis. */
import { useDragDropContext } from "../lib/dnd/index.js";
import { createRoot, onCleanup } from "../lib/reactivity.js";
/**
 * Type guard: true when the given value looks like a drag event (has a `draggable` property).
 * @param {*} event - Candidate event object.
 * @returns {boolean} True if the value is an object carrying a `draggable` key.
 */
const isDragEvent = event => {
  if (typeof event !== "object" || event === null) return false;
  return "draggable" in event;
};
/**
 * Extract the string id of the draggable referenced by a drag event.
 * @param {*} event - A drag event (e.g. from onDragStart/onDragEnd).
 * @returns {string|undefined} The draggable's id, or undefined if absent/non-string.
 */
export const getDraggableId = event => {
  if (!isDragEvent(event)) return undefined;
  const draggable = event.draggable;
  if (!draggable) return undefined;
  return typeof draggable.id === "string" ? draggable.id : undefined;
};
/**
 * Build a DnD transformer that zeroes out movement on one axis (locking the other).
 * @param {string} id - Unique transformer id.
 * @param {string} axis - The axis to constrain ("x" zeroes x, anything else zeroes y).
 * @returns {Object} A transformer descriptor with id, order, and callback fields.
 */
const createTransformer = (id, axis) => ({
  id,
  order: 100,
  callback: transform => axis === "x" ? {
    ...transform,
    x: 0
  } : {
    ...transform,
    y: 0
  }
});
/**
 * Factory that builds an axis-constraint component. The returned component registers
 * a transformer on drag start (and removes it on drag end) so the active draggable is
 * locked to the chosen axis. Renders nothing.
 * @param {string} axis - The axis to constrain ("x" or "y").
 * @param {string} transformerId - Unique id used to register/unregister the transformer.
 * @returns {Function} A component function that returns null.
 */
const createAxisConstraint = (axis, transformerId) => () => {
  const context = useDragDropContext();
  if (!context) return null;
  const [, {
    onDragStart,
    onDragEnd,
    addTransformer,
    removeTransformer
  }] = context;
  const transformer = createTransformer(transformerId, axis);
  const dispose = createRoot(dispose => {
    onDragStart(event => {
      const id = getDraggableId(event);
      if (!id) return;
      addTransformer("draggables", id, transformer);
    });
    onDragEnd(event => {
      const id = getDraggableId(event);
      if (!id) return;
      removeTransformer("draggables", id, transformer.id);
    });
    return dispose;
  });
  onCleanup(dispose);
  return null;
};
/** Component that constrains the active draggable to horizontal (x-axis only) movement. */
export const ConstrainDragXAxis = createAxisConstraint("x", "constrain-x-axis");
/** Component that constrains the active draggable to vertical (y-axis only) movement. */
export const ConstrainDragYAxis = createAxisConstraint("y", "constrain-y-axis");