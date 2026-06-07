/**
 * SerializeAddon - Serialize terminal buffer contents
 *
 * Port of xterm.js addon-serialize for ghostty-web.
 * Enables serialization of terminal contents to a string that can
 * be written back to restore terminal state.
 *
 * Usage:
 * ```typescript
 * const serializeAddon = new SerializeAddon();
 * term.loadAddon(serializeAddon);
 * const content = serializeAddon.serialize();
 * ```
 */

// ============================================================================
// Buffer Types (matching ghostty-web internal interfaces)
// ============================================================================

const isRecord = value => {
  return typeof value === "object" && value !== null;
};
const isBuffer = value => {
  if (!isRecord(value)) return false;
  if (typeof value.length !== "number") return false;
  if (typeof value.cursorX !== "number") return false;
  if (typeof value.cursorY !== "number") return false;
  if (typeof value.baseY !== "number") return false;
  if (typeof value.viewportY !== "number") return false;
  if (typeof value.getLine !== "function") return false;
  if (typeof value.getNullCell !== "function") return false;
  return true;
};
const getTerminalBuffers = value => {
  if (!isRecord(value)) return;
  const raw = value.buffer;
  if (!isRecord(raw)) return;
  const active = isBuffer(raw.active) ? raw.active : undefined;
  const normal = isBuffer(raw.normal) ? raw.normal : undefined;
  const alternate = isBuffer(raw.alternate) ? raw.alternate : undefined;
  if (!active && !normal) return;
  return {
    active,
    normal,
    alternate
  };
};

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// Helper Functions
// ============================================================================

function constrain(value, low, high) {
  return Math.max(low, Math.min(value, high));
}
function equalFg(cell1, cell2) {
  return cell1.getFgColorMode() === cell2.getFgColorMode() && cell1.getFgColor() === cell2.getFgColor();
}
function equalBg(cell1, cell2) {
  return cell1.getBgColorMode() === cell2.getBgColorMode() && cell1.getBgColor() === cell2.getBgColor();
}
function equalFlags(cell1, cell2) {
  return !!cell1.isInverse() === !!cell2.isInverse() && !!cell1.isBold() === !!cell2.isBold() && !!cell1.isUnderline() === !!cell2.isUnderline() && !!cell1.isBlink() === !!cell2.isBlink() && !!cell1.isInvisible() === !!cell2.isInvisible() && !!cell1.isItalic() === !!cell2.isItalic() && !!cell1.isDim() === !!cell2.isDim() && !!cell1.isStrikethrough() === !!cell2.isStrikethrough();
}

// ============================================================================
// Base Serialize Handler
// ============================================================================

class BaseSerializeHandler {
  constructor(_buffer) {
    this._buffer = _buffer;
  }
  serialize(range, excludeFinalCursorPosition) {
    let oldCell = this._buffer.getNullCell();
    const startRow = range.start.y;
    const endRow = range.end.y;
    const startColumn = range.start.x;
    const endColumn = range.end.x;
    this._beforeSerialize(endRow - startRow + 1, startRow, endRow);
    for (let row = startRow; row <= endRow; row++) {
      const line = this._buffer.getLine(row);
      if (line) {
        const startLineColumn = row === range.start.y ? startColumn : 0;
        const endLineColumn = Math.min(endColumn, line.length);
        for (let col = startLineColumn; col < endLineColumn; col++) {
          const c = line.getCell(col);
          if (!c) {
            continue;
          }
          this._nextCell(c, oldCell, row, col);
          oldCell = c;
        }
      }
      this._rowEnd(row, row === endRow);
    }
    this._afterSerialize();
    return this._serializeString(excludeFinalCursorPosition);
  }
  _nextCell(_cell, _oldCell, _row, _col) {}
  _rowEnd(_row, _isLastRow) {}
  _beforeSerialize(_rows, _startRow, _endRow) {}
  _afterSerialize() {}
  _serializeString(_excludeFinalCursorPosition) {
    return "";
  }
}

// ============================================================================
// String Serialize Handler
// ============================================================================

class StringSerializeHandler extends BaseSerializeHandler {
  _rowIndex = 0;
  _allRows = [];
  _allRowSeparators = [];
  _currentRow = "";
  _nullCellCount = 0;
  _firstRow = 0;
  _lastCursorRow = 0;
  _lastCursorCol = 0;
  _lastContentCursorRow = 0;
  _lastContentCursorCol = 0;
  constructor(buffer, _terminal) {
    super(buffer);
    this._terminal = _terminal;
    this._cursorStyle = this._buffer.getNullCell();
  }
  _beforeSerialize(rows, start, _end) {
    this._allRows = Array.from({
      length: rows
    });
    this._allRowSeparators = Array.from({
      length: rows
    });
    this._rowIndex = 0;
    this._currentRow = "";
    this._nullCellCount = 0;
    this._cursorStyle = this._buffer.getNullCell();
    this._lastContentCursorRow = start;
    this._lastCursorRow = start;
    this._firstRow = start;
  }
  _rowEnd(row, isLastRow) {
    let rowSeparator = "";
    const nextLine = isLastRow ? undefined : this._buffer.getLine(row + 1);
    const wrapped = !!nextLine?.isWrapped;
    if (this._nullCellCount > 0 && wrapped) {
      this._currentRow += " ".repeat(this._nullCellCount);
    }
    this._nullCellCount = 0;
    if (!isLastRow && !wrapped) {
      rowSeparator = "\r\n";
      this._lastCursorRow = row + 1;
      this._lastCursorCol = 0;
    }
    this._allRows[this._rowIndex] = this._currentRow;
    this._allRowSeparators[this._rowIndex++] = rowSeparator;
    this._currentRow = "";
    this._nullCellCount = 0;
  }
  _diffStyle(cell, oldCell) {
    const sgrSeq = [];
    const fgChanged = !equalFg(cell, oldCell);
    const bgChanged = !equalBg(cell, oldCell);
    const flagsChanged = !equalFlags(cell, oldCell);
    if (fgChanged || bgChanged || flagsChanged) {
      if (this._isAttributeDefault(cell)) {
        if (!this._isAttributeDefault(oldCell)) {
          sgrSeq.push(0);
        }
      } else {
        if (flagsChanged) {
          if (!!cell.isInverse() !== !!oldCell.isInverse()) {
            sgrSeq.push(cell.isInverse() ? 7 : 27);
          }
          if (!!cell.isBold() !== !!oldCell.isBold()) {
            sgrSeq.push(cell.isBold() ? 1 : 22);
          }
          if (!!cell.isUnderline() !== !!oldCell.isUnderline()) {
            sgrSeq.push(cell.isUnderline() ? 4 : 24);
          }
          if (!!cell.isBlink() !== !!oldCell.isBlink()) {
            sgrSeq.push(cell.isBlink() ? 5 : 25);
          }
          if (!!cell.isInvisible() !== !!oldCell.isInvisible()) {
            sgrSeq.push(cell.isInvisible() ? 8 : 28);
          }
          if (!!cell.isItalic() !== !!oldCell.isItalic()) {
            sgrSeq.push(cell.isItalic() ? 3 : 23);
          }
          if (!!cell.isDim() !== !!oldCell.isDim()) {
            sgrSeq.push(cell.isDim() ? 2 : 22);
          }
          if (!!cell.isStrikethrough() !== !!oldCell.isStrikethrough()) {
            sgrSeq.push(cell.isStrikethrough() ? 9 : 29);
          }
        }
        if (fgChanged) {
          const color = cell.getFgColor();
          const mode = cell.getFgColorMode();
          if (mode === 2 || mode === 3 || mode === -1) {
            sgrSeq.push(38, 2, color >>> 16 & 0xff, color >>> 8 & 0xff, color & 0xff);
          } else if (mode === 1) {
            // Palette
            if (color >= 16) {
              sgrSeq.push(38, 5, color);
            } else {
              sgrSeq.push(color & 8 ? 90 + (color & 7) : 30 + (color & 7));
            }
          } else {
            sgrSeq.push(39);
          }
        }
        if (bgChanged) {
          const color = cell.getBgColor();
          const mode = cell.getBgColorMode();
          if (mode === 2 || mode === 3 || mode === -1) {
            sgrSeq.push(48, 2, color >>> 16 & 0xff, color >>> 8 & 0xff, color & 0xff);
          } else if (mode === 1) {
            // Palette
            if (color >= 16) {
              sgrSeq.push(48, 5, color);
            } else {
              sgrSeq.push(color & 8 ? 100 + (color & 7) : 40 + (color & 7));
            }
          } else {
            sgrSeq.push(49);
          }
        }
      }
    }
    return sgrSeq;
  }
  _isAttributeDefault(cell) {
    const mode = cell.getFgColorMode();
    const bgMode = cell.getBgColorMode();
    if (mode === 0 && bgMode === 0) {
      return !cell.isBold() && !cell.isItalic() && !cell.isUnderline() && !cell.isBlink() && !cell.isInverse() && !cell.isInvisible() && !cell.isDim() && !cell.isStrikethrough();
    }
    const fgColor = cell.getFgColor();
    const bgColor = cell.getBgColor();
    const nullCell = this._buffer.getNullCell();
    const nullFg = nullCell.getFgColor();
    const nullBg = nullCell.getBgColor();
    return fgColor === nullFg && bgColor === nullBg && !cell.isBold() && !cell.isItalic() && !cell.isUnderline() && !cell.isBlink() && !cell.isInverse() && !cell.isInvisible() && !cell.isDim() && !cell.isStrikethrough();
  }
  _nextCell(cell, _oldCell, row, col) {
    const isPlaceHolderCell = cell.getWidth() === 0;
    if (isPlaceHolderCell) {
      return;
    }
    const codepoint = cell.getCode();
    const isInvalidCodepoint = codepoint > 0x10ffff || codepoint >= 0xd800 && codepoint <= 0xdfff;
    const isGarbage = isInvalidCodepoint || codepoint >= 0xf000 && cell.getWidth() === 1;
    const isEmptyCell = codepoint === 0 || cell.getChars() === "" || isGarbage;
    const sgrSeq = this._diffStyle(cell, this._cursorStyle);
    const styleChanged = sgrSeq.length > 0;
    if (styleChanged) {
      if (this._nullCellCount > 0) {
        this._currentRow += " ".repeat(this._nullCellCount);
        this._nullCellCount = 0;
      }
      this._lastContentCursorRow = this._lastCursorRow = row;
      this._lastContentCursorCol = this._lastCursorCol = col;
      this._currentRow += `\u001b[${sgrSeq.join(";")}m`;
      const line = this._buffer.getLine(row);
      const cellFromLine = line?.getCell(col);
      if (cellFromLine) {
        this._cursorStyle = cellFromLine;
      }
    }
    if (isEmptyCell) {
      this._nullCellCount += cell.getWidth();
    } else {
      if (this._nullCellCount > 0) {
        this._currentRow += " ".repeat(this._nullCellCount);
        this._nullCellCount = 0;
      }
      this._currentRow += cell.getChars();
      this._lastContentCursorRow = this._lastCursorRow = row;
      this._lastContentCursorCol = this._lastCursorCol = col + cell.getWidth();
    }
  }
  _serializeString(excludeFinalCursorPosition) {
    let rowEnd = this._allRows.length;
    if (this._buffer.length - this._firstRow <= this._terminal.rows) {
      rowEnd = this._lastContentCursorRow + 1 - this._firstRow;
      this._lastCursorCol = this._lastContentCursorCol;
      this._lastCursorRow = this._lastContentCursorRow;
    }
    let content = "";
    for (let i = 0; i < rowEnd; i++) {
      content += this._allRows[i];
      if (i + 1 < rowEnd) {
        content += this._allRowSeparators[i];
      }
    }
    if (excludeFinalCursorPosition) return content;
    const absoluteCursorRow = (this._buffer.baseY ?? 0) + this._buffer.cursorY;
    const cursorRow = constrain(absoluteCursorRow - this._firstRow + 1, 1, Number.MAX_SAFE_INTEGER);
    const cursorCol = this._buffer.cursorX + 1;
    content += `\u001b[${cursorRow};${cursorCol}H`;
    const line = this._buffer.getLine(absoluteCursorRow);
    const cell = line?.getCell(this._buffer.cursorX);
    const style = (() => {
      if (!cell) return this._buffer.getNullCell();
      if (cell.getWidth() !== 0) return cell;
      if (this._buffer.cursorX > 0) return line?.getCell(this._buffer.cursorX - 1) ?? cell;
      return cell;
    })();
    const sgrSeq = this._diffStyle(style, this._cursorStyle);
    if (sgrSeq.length) content += `\u001b[${sgrSeq.join(";")}m`;
    return content;
  }
}

// ============================================================================
// SerializeAddon Class
// ============================================================================

export class SerializeAddon {
  /**
   * Activate the addon (called by Terminal.loadAddon)
   */
  activate(terminal) {
    this._terminal = terminal;
  }

  /**
   * Dispose the addon and clean up resources
   */
  dispose() {
    this._terminal = undefined;
  }

  /**
   * Serializes terminal rows into a string that can be written back to the
   * terminal to restore the state. The cursor will also be positioned to the
   * correct cell.
   *
   * @param options Custom options to allow control over what gets serialized.
   */
  serialize(options) {
    if (!this._terminal) {
      throw new Error("Cannot use addon until it has been loaded");
    }
    const buffer = getTerminalBuffers(this._terminal);
    if (!buffer) {
      return "";
    }
    const normalBuffer = buffer.normal ?? buffer.active;
    const altBuffer = buffer.alternate;
    if (!normalBuffer) {
      return "";
    }
    let content = options?.range ? this._serializeBufferByRange(normalBuffer, options.range, true) : this._serializeBufferByScrollback(normalBuffer, options?.scrollback);
    if (!options?.excludeAltBuffer && buffer.active?.type === "alternate" && altBuffer) {
      const alternateContent = this._serializeBufferByScrollback(altBuffer, undefined);
      content += `\u001b[?1049h\u001b[H${alternateContent}`;
    }
    return content;
  }

  /**
   * Serializes terminal content as plain text (no escape sequences)
   * @param options Custom options to allow control over what gets serialized.
   */
  serializeAsText(options) {
    if (!this._terminal) {
      throw new Error("Cannot use addon until it has been loaded");
    }
    const buffer = getTerminalBuffers(this._terminal);
    if (!buffer) {
      return "";
    }
    const activeBuffer = buffer.active ?? buffer.normal;
    if (!activeBuffer) {
      return "";
    }
    const maxRows = activeBuffer.length;
    const scrollback = options?.scrollback;
    const correctRows = scrollback === undefined ? maxRows : constrain(scrollback + this._terminal.rows, 0, maxRows);
    const startRow = maxRows - correctRows;
    const endRow = maxRows - 1;
    const lines = [];
    for (let row = startRow; row <= endRow; row++) {
      const line = activeBuffer.getLine(row);
      if (line) {
        const text = line.translateToString(options?.trimWhitespace ?? true);
        lines.push(text);
      }
    }

    // Trim trailing empty lines if requested
    if (options?.trimWhitespace) {
      while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
    }
    return lines.join("\n");
  }
  _serializeBufferByScrollback(buffer, scrollback) {
    const maxRows = buffer.length;
    const rows = this._terminal?.rows ?? 24;
    const correctRows = scrollback === undefined ? maxRows : constrain(scrollback + rows, 0, maxRows);
    return this._serializeBufferByRange(buffer, {
      start: maxRows - correctRows,
      end: maxRows - 1
    }, false);
  }
  _serializeBufferByRange(buffer, range, excludeFinalCursorPosition) {
    const handler = new StringSerializeHandler(buffer, this._terminal);
    const cols = this._terminal?.cols ?? 80;
    return handler.serialize({
      start: {
        x: 0,
        y: range.start
      },
      end: {
        x: cols,
        y: range.end
      }
    }, excludeFinalCursorPosition);
  }
}