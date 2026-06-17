/** @file In-app CodeMirror-based file editor exposed as the global window.VanillaIDE (vanilla browser script, no bundler). */
/*
 * vanilla-ide.js — in-app file editor (vanilla, no bundler, no `import`).
 *
 * Reuses the CodeMirror 5 approach from shin-htmleditor.js. Loaded as a classic
 * <script> (globals only). Depends on:
 *   - window.CodeMirror   (vendored at ./vendor/codemirror, classic scripts)
 *   - window.api.readFile / window.api.writeFile  (Electron preload bridge)
 *
 * Public API (one editor per host element):
 *   window.VanillaIDE.mount(hostEl, { absPath, relName })
 *   window.VanillaIDE.unmount(hostEl)
 *   window.VanillaIDE.isDirty(hostEl) -> boolean
 */
(function () {
  "use strict";

  // host element -> instance state
  var instances = new WeakMap();
  // absPath -> unsaved buffer. Switching tabs destroys the editor (the tab
  // content is recreated per active tab), so unsaved edits would be lost on
  // switch. We stash the dirty buffer here on unmount and restore it on remount.
  var unsavedCache = Object.create(null);

  /**
   * Report whether the Electron preload file bridge (window.api.readFile) is
   * available, i.e. whether file editing can actually read/write to disk.
   *
   * @returns {boolean} True when the readFile bridge is present.
   */
  function hasBridge() {
    return typeof window !== "undefined" && window.api && typeof window.api.readFile === "function";
  }

  // Pick a CodeMirror mime/mode for a filename, but only if the corresponding
  // mode script was actually loaded (see index.html). Otherwise plain text.
  /**
   * Resolve the CodeMirror mode/mime for a filename, returning a mode only when
   * the corresponding CodeMirror mode script was actually loaded; otherwise the
   * editor falls back to plain text.
   *
   * @param {string} name - The file name (or path) to classify by extension.
   * @returns {string} The CodeMirror mime or mode identifier, or null when no
   *   loaded mode matches the file.
   */
  function detectMode(name) {
    var CM = window.CodeMirror;
    if (!CM || typeof CM.findModeByFileName !== "function") return null;
    var info = CM.findModeByFileName(name || "");
    if (!info || !info.mode) return null;
    if (!CM.modes || !CM.modes[info.mode]) return null;
    return info.mime || info.mode;
  }

  /**
   * Report whether the document is currently in Bootstrap dark color mode
   * (data-bs-theme="dark" on the root element).
   *
   * @returns {boolean} True when dark mode is active.
   */
  function isDark() {
    var root = document.documentElement;
    return (root.getAttribute("data-bs-theme") || "").toLowerCase() === "dark";
  }

  /**
   * Choose the CodeMirror editor theme name matching the current color mode.
   *
   * @returns {string} "material-darker" in dark mode, otherwise "default".
   */
  function themeName() {
    return isDark() ? "material-darker" : "default";
  }

  /**
   * Create a DOM element with an optional class and text content.
   *
   * @param {string} tag - Tag name to create (e.g. "div", "span").
   * @param {string} cls - CSS class to assign, or a falsy value for none.
   * @param {string} text - Text content to set; when null/undefined no text is set.
   * @returns {Node} The newly created element.
   */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Build the editor's surrounding chrome (toolbar with unsaved indicator and
   * status text plus an empty editor wrapper) into a host element, replacing
   * any existing content.
   *
   * @param {Node} hostEl - The host element to populate with editor chrome.
   * @param {string} relName - Project-relative file name (currently unused for
   *   layout; the file name is shown in the tab instead).
   * @param {Function} onExit - Optional exit callback (currently unused).
   * @returns {Object} References to the created chrome nodes: { bar, editorWrap,
   *   dirty, status }.
   */
  function buildChrome(hostEl, relName, onExit) {
    hostEl.innerHTML = "";
    hostEl.classList.add("vide-host");

    var bar = el("div", "vide-toolbar");
    var spacer = el("span", "vide-spacer");
    var dirty = el("span", "vide-dirty", "●"); // ● unsaved indicator
    dirty.title = "未保存の変更";
    dirty.style.visibility = "hidden";
    var status = el("span", "vide-status", "");
    // Save and view-mode controls live in the app toolbar now, and the file name
    // is already shown in the editor tab, so the chrome bar only carries the
    // unsaved (●) indicator and status — no redundant in-pane file name header.

    bar.appendChild(dirty);
    bar.appendChild(spacer);
    bar.appendChild(status);

    var editorWrap = el("div", "vide-editor");

    hostEl.appendChild(bar);
    hostEl.appendChild(editorWrap);

    return { bar: bar, editorWrap: editorWrap, dirty: dirty, status: status };
  }

  /**
   * Set the editor's status-bar message. Non-error messages auto-clear after a
   * short delay; error messages are styled and persist.
   *
   * @param {Object} inst - The editor instance whose chrome to update.
   * @param {string} msg - The status text to display, or empty to clear.
   * @param {boolean} isError - When true, render as an error and skip auto-clear.
   * @returns {void}
   */
  function setStatus(inst, msg, isError) {
    if (!inst.chrome) return;
    inst.chrome.status.textContent = msg || "";
    inst.chrome.status.classList.toggle("text-danger", !!isError);
    if (msg && !isError) {
      clearTimeout(inst._statusTimer);
      inst._statusTimer = setTimeout(function () {
        if (inst.chrome) inst.chrome.status.textContent = "";
      }, 2000);
    }
  }

  // Notify the Solid tab system when an editor's dirty state changes, keyed by
  // the project-relative path (inst.relName === file.pathFromTab(tab)).
  /**
   * Dispatch a "vide:dirty" window CustomEvent (keyed by the editor's relative
   * path) when its unsaved/dirty state transitions, so the tab UI can update.
   * Only fires on an actual change in dirty state.
   *
   * @param {Object} inst - The editor instance.
   * @param {boolean} dirty - The new dirty state (true = unsaved changes).
   * @returns {void}
   */
  function emitDirty(inst, dirty) {
    if (!inst || !inst.relName) return;
    if (inst._lastDirty === dirty) return; // only on change
    inst._lastDirty = dirty;
    try {
      window.dispatchEvent(new CustomEvent("vide:dirty", {
        detail: { path: inst.relName, dirty: !!dirty }
      }));
    } catch (e) {}
  }

  /**
   * Recompute the editor's dirty state from CodeMirror, toggle the unsaved
   * indicator's visibility, and emit a dirty-change event.
   *
   * @param {Object} inst - The editor instance.
   * @returns {void}
   */
  function refreshDirty(inst) {
    var clean = inst.cm ? inst.cm.isClean(inst.baseGen) : true;
    inst.chrome.dirty.style.visibility = clean ? "hidden" : "visible";
    emitDirty(inst, !clean);
  }

  // Notepad++-style editor status (cursor line/col, char count, EOL, encoding,
  // read-only), keyed by path. Consumed by the bottom status bar.
  /**
   * Dispatch a "vide:editorstate" window CustomEvent describing the editor's
   * current cursor position, character/line counts, selection length, line
   * ending, encoding, and read-only state, for the bottom status bar.
   *
   * @param {Object} inst - The editor instance whose CodeMirror state to read.
   * @returns {void}
   */
  function emitEditorState(inst) {
    if (!inst || !inst.cm || !inst.relName) return;
    var cm = inst.cm;
    var cur = cm.getCursor();
    var sel = cm.getSelection();
    try {
      window.dispatchEvent(new CustomEvent("vide:editorstate", {
        detail: {
          path: inst.relName,
          line: cur.line + 1,
          col: cur.ch + 1,
          chars: cm.getValue().length,
          lines: cm.lineCount(),
          selChars: sel ? sel.length : 0,
          eol: inst.eol || "LF",
          encoding: inst.encoding || "UTF-8",
          readonly: !!cm.getOption("readOnly"),
        },
      }));
    } catch (e) {}
  }

  /**
   * Save the editor's current content to disk via the file bridge. Untitled
   * (new) buffers are routed to the Save-as dialog; clean buffers are skipped.
   * Updates the dirty state, clears the unsaved cache, and reports status.
   *
   * @param {Object} inst - The editor instance to save.
   * @returns {void}
   */
  function save(inst) {
    if (!inst.cm || !hasBridge()) return;
    // A new (untitled) in-memory buffer has no disk path yet: prompt the user
    // for a destination via the native Save dialog rather than writing a
    // pre-named "untitled" file into the project.
    if (inst.newBuffer) { saveAs(inst); return; }
    if (inst.cm.isClean(inst.baseGen)) return;
    var content = inst.cm.getValue();
    setStatus(inst, "保存中…");
    window.api.writeFile(inst.absPath, content).then(function () {
      delete unsavedCache[inst.cacheKey];
      inst.baseGen = inst.cm.changeGeneration(true);
      refreshDirty(inst);
      setStatus(inst, "保存しました");
    }, function (err) {
      refreshDirty(inst);
      setStatus(inst, "保存に失敗: " + (err && err.message ? err.message : err), true);
    });
  }

  // Save-as for a brand-new untitled buffer: ask where to write, then write and
  // signal the app (vide:saved-as) to swap the untitled tab for the real file.
  /**
   * Prompt for a destination via the native save dialog, write the editor's
   * content there, then dispatch a "vide:saved-as" event so the app can swap
   * the untitled tab for the real file. No-op if the picker bridge is missing
   * or the user cancels.
   *
   * @param {Object} inst - The (typically untitled) editor instance to save.
   * @returns {void}
   */
  function saveAs(inst) {
    if (!inst.cm) return;
    if (!window.api || typeof window.api.saveFilePicker !== "function") {
      setStatus(inst, "保存ダイアログを利用できません", true);
      return;
    }
    var content = inst.cm.getValue();
    var def = inst.saveDefaultPath || inst.relName || "untitled.md";
    setStatus(inst, "保存先を選択…");
    window.api.saveFilePicker({ title: "名前を付けて保存", defaultPath: def }).then(function (dest) {
      if (!dest) { setStatus(inst, ""); return; } // canceled
      window.api.writeFile(dest, content).then(function () {
        delete unsavedCache[inst.cacheKey];
        if (inst.cm) inst.baseGen = inst.cm.changeGeneration(true);
        refreshDirty(inst);
        setStatus(inst, "保存しました");
        try {
          window.dispatchEvent(new CustomEvent("vide:saved-as", { detail: { tab: inst.tabId, path: dest } }));
        } catch (e) {}
      }, function (err) {
        setStatus(inst, "保存に失敗: " + (err && err.message ? err.message : err), true);
      });
    }, function (err) {
      setStatus(inst, "保存に失敗: " + (err && err.message ? err.message : err), true);
    });
  }

  /**
   * Apply the editor theme that matches the current color mode to the instance's
   * CodeMirror.
   *
   * @param {Object} inst - The editor instance.
   * @returns {void}
   */
  function applyTheme(inst) {
    if (inst.cm) inst.cm.setOption("theme", themeName());
  }

  // Build the CodeMirror editor into the (already-mounted) host from a raw
  // string. Shared by the disk-read path and the new-buffer (untitled) path.
  /**
   * Instantiate the CodeMirror editor for an instance from raw file content.
   * Detects line ending and encoding from the original string, restores any
   * unsaved buffer cached across a tab switch, wires change/cursor listeners,
   * and installs resize/visibility/theme observers so the editor stays correctly
   * sized and themed. Shared by both the disk-read and untitled-buffer paths.
   *
   * @param {Object} inst - The editor instance (must already have built chrome).
   * @param {string} raw - The initial editor content as a raw string.
   * @returns {void}
   */
  function buildEditor(inst, raw) {
    var chrome = inst.chrome;
    chrome.editorWrap.innerHTML = "";
    // Detect line ending + encoding from the original bytes-as-string (CM
    // normalizes to \n internally, so capture this before mounting).
    inst.eol = /\r\n/.test(raw) ? "CRLF" : /\r/.test(raw) ? "CR" : "LF";
    inst.encoding = raw.charCodeAt(0) === 0xFEFF ? "UTF-8-BOM" : "UTF-8";
    var CM = window.CodeMirror;
    var cm = CM(chrome.editorWrap, {
      value: raw,
      lineNumbers: true,
      theme: themeName(),
      mode: detectMode(inst.relName),
      lineWrapping: false,
      extraKeys: {
        "Ctrl-S": function () { save(inst); },
        "Cmd-S": function () { save(inst); }
      }
    });
    cm.setSize("100%", "100%");
    inst.cm = cm;
    inst.baseGen = cm.changeGeneration(true);
    // Restore unsaved edits cached when this buffer's editor was unmounted (tab
    // switch). The cached buffer differs from baseGen, so setting it registers
    // as a change -> the tab correctly shows dirty. Keyed by inst.cacheKey
    // (absPath for real files, relName for untitled buffers).
    var cached = unsavedCache[inst.cacheKey];
    if (cached != null && cached !== raw) cm.setValue(cached);
    cm.on("change", function () { refreshDirty(inst); emitEditorState(inst); });
    cm.on("cursorActivity", function () { emitEditorState(inst); });
    refreshDirty(inst);
    emitEditorState(inst);
    // CM mis-measures when mounted before layout settles (or while the window
    // is occluded). Do NOT gate the corrective refresh on requestAnimationFrame:
    // rAF is paused while the window is hidden/occluded, so a one-shot rAF never
    // fires on a cold first launch and the editor is left mis-sized (content
    // missing / wrong height with blank below) until a later launch. setTimeout
    // fires regardless of visibility, and a ResizeObserver keeps the editor
    // correctly sized whenever the pane first gains a real size or is resized.
    setTimeout(function () { if (inst.cm) inst.cm.refresh(); }, 0);
    if (typeof ResizeObserver === "function") {
      var lastH = 0, lastW = 0;
      inst.resizeObserver = new ResizeObserver(function () {
        if (!inst.cm) return;
        var rect = chrome.editorWrap.getBoundingClientRect();
        // Only refresh on a real size change to avoid redundant reflows.
        if (Math.round(rect.height) === lastH && Math.round(rect.width) === lastW) return;
        lastH = Math.round(rect.height);
        lastW = Math.round(rect.width);
        inst.cm.refresh();
      });
      inst.resizeObserver.observe(chrome.editorWrap);
    }
    // File tabs are hidden with display:none, so an editor created in a
    // background tab measures 0 and renders a single line. ResizeObserver does
    // NOT reliably fire for a display:none -> visible transition driven by an
    // ancestor, so also refresh when the editor actually becomes visible:
    // IntersectionObserver is the canonical "became visible" signal and fires
    // when the tab is switched to.
    if (typeof IntersectionObserver === "function") {
      inst.visObserver = new IntersectionObserver(function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].isIntersecting && inst.cm) inst.cm.refresh();
        }
      });
      inst.visObserver.observe(chrome.editorWrap);
    }
    // Follow Bootstrap light/dark theme switches.
    inst.observer = new MutationObserver(function () { applyTheme(inst); });
    inst.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });
  }

  /**
   * Public API: mount an editor into a host element for a file or a new
   * untitled buffer. Idempotent (unmounts any prior instance first). Shows a
   * fallback message when the file bridge or CodeMirror is unavailable; reads
   * the file via the bridge unless opts.newBuffer is set.
   *
   * @param {Node} hostEl - The host element to mount the editor into.
   * @param {Object} opts - Mount options: absPath (absolute file path),
   *   relName (project-relative name/label), newBuffer (boolean, start an empty
   *   untitled buffer without reading disk), tabId, saveDefaultPath, onExit.
   * @returns {void}
   */
  function mount(hostEl, opts) {
    if (!hostEl) return;
    unmount(hostEl); // idempotent

    var absPath = opts && opts.absPath;
    var newBuffer = !!(opts && opts.newBuffer);
    var relName = (opts && opts.relName) || absPath || "";

    if (!hasBridge()) {
      hostEl.innerHTML = "";
      hostEl.appendChild(el("div", "vide-message", "編集はデスクトップ版でのみ利用できます。"));
      return;
    }
    if (!window.CodeMirror) {
      hostEl.innerHTML = "";
      hostEl.appendChild(el("div", "vide-message", "エディタの読み込みに失敗しました (CodeMirror)。"));
      return;
    }

    var chrome = buildChrome(hostEl, relName, opts && opts.onExit);
    var inst = {
      hostEl: hostEl,
      absPath: newBuffer ? null : absPath,
      relName: relName,
      chrome: chrome,
      cm: null,
      baseGen: 1,
      newBuffer: newBuffer,
      tabId: opts && opts.tabId,
      saveDefaultPath: opts && opts.saveDefaultPath
    };
    // Cache key for unsaved-edit stashing: untitled buffers have no absPath, so
    // key them by their (stable) relName/tab path instead.
    inst.cacheKey = newBuffer ? relName : absPath;
    instances.set(hostEl, inst);

    if (newBuffer) {
      // Brand-new buffer: never touch the disk. Start empty (buildEditor
      // restores any unsaved content stashed across a tab switch).
      buildEditor(inst, "");
      return;
    }

    chrome.editorWrap.appendChild(el("div", "vide-loading", "読み込み中…"));

    window.api.readFile(absPath).then(function (content) {
      if (instances.get(hostEl) !== inst) return; // unmounted/replaced meanwhile
      buildEditor(inst, content == null ? "" : String(content));
    }, function (err) {
      if (instances.get(hostEl) !== inst) return;
      chrome.editorWrap.innerHTML = "";
      chrome.editorWrap.appendChild(el("div", "vide-message", "ファイルを開けませんでした: " + (err && err.message ? err.message : err)));
    });
  }

  /**
   * Public API: tear down the editor mounted in a host element. Disconnects all
   * observers and timers, clears the tab dirty indicator, caches unsaved edits
   * by the instance's cache key (so a remount can restore them) or clears stale
   * cache when clean, and empties the host element. No-op if nothing is mounted.
   *
   * @param {Node} hostEl - The host element whose editor should be unmounted.
   * @returns {void}
   */
  function unmount(hostEl) {
    var inst = instances.get(hostEl);
    if (!inst) return;
    if (inst.observer) { try { inst.observer.disconnect(); } catch (e) {} }
    if (inst.resizeObserver) { try { inst.resizeObserver.disconnect(); } catch (e) {} }
    if (inst.visObserver) { try { inst.visObserver.disconnect(); } catch (e) {} }
    clearTimeout(inst._statusTimer);
    emitDirty(inst, false); // clear tab indicator on unmount
    // Preserve unsaved edits across tab switches: cache the dirty buffer by its
    // cacheKey (absPath for real files, relName for untitled buffers); a clean
    // buffer clears any stale cache so remounting restores the edits.
    if (inst.cm && inst.cacheKey) {
      if (!inst.cm.isClean(inst.baseGen)) unsavedCache[inst.cacheKey] = inst.cm.getValue();
      else delete unsavedCache[inst.cacheKey];
    }
    instances.delete(hostEl);
    inst.cm = null;
    if (hostEl) {
      hostEl.innerHTML = "";
      hostEl.classList.remove("vide-host");
    }
  }

  /**
   * Public API: report whether the editor mounted in a host element has unsaved
   * changes.
   *
   * @param {Node} hostEl - The host element to check.
   * @returns {boolean} True when an editor is mounted there with unsaved edits.
   */
  function isDirty(hostEl) {
    var inst = instances.get(hostEl);
    return !!(inst && inst.cm && !inst.cm.isClean(inst.baseGen));
  }

  // Public global API surface. mount/unmount/isDirty as above; save triggers a
  // save of the editor in the host; refresh re-measures its CodeMirror; and
  // dropUnsaved discards a stashed unsaved buffer by its cache key.
  window.VanillaIDE = { mount: mount, unmount: unmount, isDirty: isDirty, save: function (hostEl) {
    var inst = instances.get(hostEl);
    if (inst) save(inst);
  }, refresh: function (hostEl) {
    var inst = instances.get(hostEl);
    if (inst && inst.cm) inst.cm.refresh();
  }, dropUnsaved: function (key) {
    // Drop a stashed unsaved buffer (called when a tab is closed, so a future
    // tab reusing the same path — e.g. a recycled "untitled-N" name — does not
    // resurrect the discarded content).
    if (key != null) delete unsavedCache[key];
  } };
})();
