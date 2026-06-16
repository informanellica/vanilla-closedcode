/** @file Prompt history model for the prompt input: cloning/normalizing prompt entries and navigating up/down through previously submitted prompts. */
const DEFAULT_PROMPT = [{
  type: "text",
  content: "",
  start: 0,
  end: 0
}];
/** Maximum number of prompt entries retained in history. */
export const MAX_HISTORY = 100;
/**
 * Decide whether an up/down arrow at the current cursor position should trigger history navigation
 * rather than ordinary caret movement.
 * @param {string} direction - "up" or "down".
 * @param {string} text - The current editor text.
 * @param {number} cursor - The caret offset within the text.
 * @param {boolean} inHistory - Whether the editor is already showing a history entry.
 * @returns {boolean} True if the arrow should navigate history.
 */
export function canNavigateHistoryAtCursor(direction, text, cursor, inHistory = false) {
  const position = Math.max(0, Math.min(cursor, text.length));
  const atStart = position === 0;
  const atEnd = position === text.length;
  if (inHistory) return atStart || atEnd;
  if (direction === "up") return position === 0 && text.length === 0;
  return position === text.length;
}
/**
 * Deep-clone an array of prompt parts so stored history entries are isolated from live editor state.
 * @param {Array} prompt - The prompt parts to clone (text/image/agent/file parts).
 * @returns {Array} A new array of shallow-cloned parts (file parts also clone their selection).
 */
export function clonePromptParts(prompt) {
  return prompt.map(part => {
    if (part.type === "text") return {
      ...part
    };
    if (part.type === "image") return {
      ...part
    };
    if (part.type === "agent") return {
      ...part
    };
    return {
      ...part,
      selection: part.selection ? {
        ...part.selection
      } : undefined
    };
  });
}
/**
 * Clone a comment selection, preserving the optional side/endSide fields only when present.
 * @param {Object} selection - A selection with start/end and optional side/endSide.
 * @returns {Object} A new selection object copy.
 */
function cloneSelection(selection) {
  return {
    start: selection.start,
    end: selection.end,
    ...(selection.side ? {
      side: selection.side
    } : {}),
    ...(selection.endSide ? {
      endSide: selection.endSide
    } : {})
  };
}
/**
 * Deep-clone the review comments attached to a prompt history entry.
 * @param {Array} comments - The comments to clone.
 * @returns {Array} A new array of cloned comments with cloned selections.
 */
export function clonePromptHistoryComments(comments) {
  return comments.map(comment => ({
    ...comment,
    selection: cloneSelection(comment.selection)
  }));
}
/**
 * Normalize a history entry into the canonical {prompt, comments} shape, accepting either a legacy
 * bare prompt array or the structured entry object.
 * @param {Array|Object} entry - A legacy prompt-parts array or a {prompt, comments} entry.
 * @returns {Object} An object with cloned `prompt` parts and cloned `comments`.
 */
export function normalizePromptHistoryEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      prompt: clonePromptParts(entry),
      comments: []
    };
  }
  return {
    prompt: clonePromptParts(entry.prompt),
    comments: clonePromptHistoryComments(entry.comments)
  };
}
/**
 * Compute the total character length of a prompt by summing the content of its text-bearing parts.
 * @param {Array} prompt - The prompt parts.
 * @returns {number} The combined length of all parts that carry `content`.
 */
export function promptLength(prompt) {
  return prompt.reduce((len, part) => len + ("content" in part ? part.content.length : 0), 0);
}
/**
 * Prepend a new prompt to the history, skipping empty prompts and consecutive duplicates and capping the size.
 * @param {Array} entries - The existing history entries (most recent first).
 * @param {Array} prompt - The prompt parts being recorded.
 * @param {Array} comments - The review comments attached to the prompt.
 * @param {number} max - The maximum number of entries to retain.
 * @returns {Array} The updated history array (unchanged if the prompt is empty or a duplicate of the latest).
 */
export function prependHistoryEntry(entries, prompt, comments = [], max = MAX_HISTORY) {
  const text = prompt.map(part => "content" in part ? part.content : "").join("").trim();
  const hasImages = prompt.some(part => part.type === "image");
  const hasComments = comments.some(comment => !!comment.comment.trim());
  if (!text && !hasImages && !hasComments) return entries;
  const entry = {
    prompt: clonePromptParts(prompt),
    comments: clonePromptHistoryComments(comments)
  };
  const last = entries[0];
  if (last && isPromptEqual(last, entry)) return entries;
  return [entry, ...entries].slice(0, max);
}
/**
 * Compare two review comments for full structural equality (path, comment, origin, preview, and selection).
 * @param {Object} commentA - The first comment.
 * @param {Object} commentB - The second comment.
 * @returns {boolean} True if the comments are equal.
 */
function isCommentEqual(commentA, commentB) {
  return commentA.path === commentB.path && commentA.comment === commentB.comment && commentA.origin === commentB.origin && commentA.preview === commentB.preview && commentA.selection.start === commentB.selection.start && commentA.selection.end === commentB.selection.end && commentA.selection.side === commentB.selection.side && commentA.selection.endSide === commentB.selection.endSide;
}
/**
 * Compare two history entries for equality by normalizing both and comparing parts and comments in order.
 * @param {Array|Object} promptA - The first entry (legacy array or structured entry).
 * @param {Array|Object} promptB - The second entry (legacy array or structured entry).
 * @returns {boolean} True if the entries are equivalent.
 */
function isPromptEqual(promptA, promptB) {
  const entryA = normalizePromptHistoryEntry(promptA);
  const entryB = normalizePromptHistoryEntry(promptB);
  if (entryA.prompt.length !== entryB.prompt.length) return false;
  for (let i = 0; i < entryA.prompt.length; i++) {
    const partA = entryA.prompt[i];
    const partB = entryB.prompt[i];
    if (partA.type !== partB.type) return false;
    if (partA.type === "text" && partA.content !== (partB.type === "text" ? partB.content : "")) return false;
    if (partA.type === "file") {
      if (partA.path !== (partB.type === "file" ? partB.path : "")) return false;
      const a = partA.selection;
      const b = partB.type === "file" ? partB.selection : undefined;
      const sameSelection = !a && !b || !!a && !!b && a.startLine === b.startLine && a.startChar === b.startChar && a.endLine === b.endLine && a.endChar === b.endChar;
      if (!sameSelection) return false;
    }
    if (partA.type === "agent" && partA.name !== (partB.type === "agent" ? partB.name : "")) return false;
    if (partA.type === "image" && partA.id !== (partB.type === "image" ? partB.id : "")) return false;
  }
  if (entryA.comments.length !== entryB.comments.length) return false;
  for (let i = 0; i < entryA.comments.length; i++) {
    const commentA = entryA.comments[i];
    const commentB = entryB.comments[i];
    if (!commentA || !commentB || !isCommentEqual(commentA, commentB)) return false;
  }
  return true;
}
/**
 * Compute the next history navigation state for an up/down step, saving the in-progress prompt when first
 * entering history and restoring it when stepping back past the most recent entry.
 * @param {Object} input - Navigation input: {direction, entries, historyIndex, savedPrompt, currentPrompt, currentComments}.
 * @returns {Object} A result with {handled, historyIndex, savedPrompt} and, when handled by loading an entry, {entry, cursor}.
 */
export function navigatePromptHistory(input) {
  if (input.direction === "up") {
    if (input.entries.length === 0) {
      return {
        handled: false,
        historyIndex: input.historyIndex,
        savedPrompt: input.savedPrompt
      };
    }
    if (input.historyIndex === -1) {
      const entry = normalizePromptHistoryEntry(input.entries[0]);
      return {
        handled: true,
        historyIndex: 0,
        savedPrompt: {
          prompt: clonePromptParts(input.currentPrompt),
          comments: clonePromptHistoryComments(input.currentComments)
        },
        entry,
        cursor: "start"
      };
    }
    if (input.historyIndex < input.entries.length - 1) {
      const next = input.historyIndex + 1;
      const entry = normalizePromptHistoryEntry(input.entries[next]);
      return {
        handled: true,
        historyIndex: next,
        savedPrompt: input.savedPrompt,
        entry,
        cursor: "start"
      };
    }
    return {
      handled: false,
      historyIndex: input.historyIndex,
      savedPrompt: input.savedPrompt
    };
  }
  if (input.historyIndex > 0) {
    const next = input.historyIndex - 1;
    const entry = normalizePromptHistoryEntry(input.entries[next]);
    return {
      handled: true,
      historyIndex: next,
      savedPrompt: input.savedPrompt,
      entry,
      cursor: "end"
    };
  }
  if (input.historyIndex === 0) {
    if (input.savedPrompt) {
      return {
        handled: true,
        historyIndex: -1,
        savedPrompt: null,
        entry: input.savedPrompt,
        cursor: "end"
      };
    }
    return {
      handled: true,
      historyIndex: -1,
      savedPrompt: null,
      entry: {
        prompt: DEFAULT_PROMPT,
        comments: []
      },
      cursor: "end"
    };
  }
  return {
    handled: false,
    historyIndex: input.historyIndex,
    savedPrompt: input.savedPrompt
  };
}