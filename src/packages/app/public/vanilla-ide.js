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

  function hasBridge() {
    return typeof window !== "undefined" && window.api && typeof window.api.readFile === "function";
  }

  // Pick a CodeMirror mime/mode for a filename, but only if the corresponding
  // mode script was actually loaded (see index.html). Otherwise plain text.
  function detectMode(name) {
    var CM = window.CodeMirror;
    if (!CM || typeof CM.findModeByFileName !== "function") return null;
    var info = CM.findModeByFileName(name || "");
    if (!info || !info.mode) return null;
    if (!CM.modes || !CM.modes[info.mode]) return null;
    return info.mime || info.mode;
  }

  function isDark() {
    var root = document.documentElement;
    return (root.getAttribute("data-bs-theme") || "").toLowerCase() === "dark";
  }

  function themeName() {
    return isDark() ? "material-darker" : "default";
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

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

  function refreshDirty(inst) {
    var clean = inst.cm ? inst.cm.isClean(inst.baseGen) : true;
    inst.chrome.dirty.style.visibility = clean ? "hidden" : "visible";
    emitDirty(inst, !clean);
  }

  // Notepad++-style editor status (cursor line/col, char count, EOL, encoding,
  // read-only), keyed by path. Consumed by the bottom status bar.
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

  function applyTheme(inst) {
    if (inst.cm) inst.cm.setOption("theme", themeName());
  }

  // Build the CodeMirror editor into the (already-mounted) host from a raw
  // string. Shared by the disk-read path and the new-buffer (untitled) path.
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

  function isDirty(hostEl) {
    var inst = instances.get(hostEl);
    return !!(inst && inst.cm && !inst.cm.isClean(inst.baseGen));
  }

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
