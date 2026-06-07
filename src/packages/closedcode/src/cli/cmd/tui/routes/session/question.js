import { use as _$use } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createStore } from "solid-js/store";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { useKeybind } from "../../context/keybind.js";
import { selectedForeground, tint, useTheme } from "../../context/theme.js";
import { useSDK } from "../../context/sdk.js";
import { SplitBorder } from "../../component/border.js";
import { useTextareaKeybindings } from "../../component/textarea-keybindings.js";
import { useDialog } from "../../ui/dialog.js";
export function QuestionPrompt(props) {
  const sdk = useSDK();
  const {
    theme
  } = useTheme();
  const keybind = useKeybind();
  const bindings = useTextareaKeybindings();
  const questions = createMemo(() => props.request.questions);
  const single = createMemo(() => questions().length === 1 && questions()[0]?.multiple !== true);
  const tabs = createMemo(() => single() ? 1 : questions().length + 1); // questions + confirm tab (no confirm for single select)
  const [tabHover, setTabHover] = createSignal(null);
  const [store, setStore] = createStore({
    tab: 0,
    answers: [],
    custom: [],
    selected: 0,
    editing: false
  });
  let textarea;
  const question = createMemo(() => questions()[store.tab]);
  const confirm = createMemo(() => !single() && store.tab === questions().length);
  const options = createMemo(() => question()?.options ?? []);
  const custom = createMemo(() => question()?.custom !== false);
  const other = createMemo(() => custom() && store.selected === options().length);
  const input = createMemo(() => store.custom[store.tab] ?? "");
  const multi = createMemo(() => question()?.multiple === true);
  const customPicked = createMemo(() => {
    const value = input();
    if (!value) return false;
    return store.answers[store.tab]?.includes(value) ?? false;
  });
  function submit() {
    const answers = questions().map((_, i) => store.answers[i] ?? []);
    void sdk.client.question.reply({
      requestID: props.request.id,
      answers
    });
  }
  function reject() {
    void sdk.client.question.reject({
      requestID: props.request.id
    });
  }
  function pick(answer, custom = false) {
    const answers = [...store.answers];
    answers[store.tab] = [answer];
    setStore("answers", answers);
    if (custom) {
      const inputs = [...store.custom];
      inputs[store.tab] = answer;
      setStore("custom", inputs);
    }
    if (single()) {
      void sdk.client.question.reply({
        requestID: props.request.id,
        answers: [[answer]]
      });
      return;
    }
    setStore("tab", store.tab + 1);
    setStore("selected", 0);
  }
  function toggle(answer) {
    const existing = store.answers[store.tab] ?? [];
    const next = [...existing];
    const index = next.indexOf(answer);
    if (index === -1) next.push(answer);
    if (index !== -1) next.splice(index, 1);
    const answers = [...store.answers];
    answers[store.tab] = next;
    setStore("answers", answers);
  }
  function moveTo(index) {
    setStore("selected", index);
  }
  function selectTab(index) {
    setStore("tab", index);
    setStore("selected", 0);
  }
  function selectOption() {
    if (other()) {
      if (!multi()) {
        setStore("editing", true);
        return;
      }
      const value = input();
      if (value && customPicked()) {
        toggle(value);
        return;
      }
      setStore("editing", true);
      return;
    }
    const opt = options()[store.selected];
    if (!opt) return;
    if (multi()) {
      toggle(opt.label);
      return;
    }
    pick(opt.label);
  }
  const dialog = useDialog();
  useKeyboard(evt => {
    // Skip processing if a dialog (e.g., command palette) is open
    if (dialog.stack.length > 0) return;

    // When editing custom answer textarea
    if (store.editing && !confirm()) {
      if (evt.name === "escape") {
        evt.preventDefault();
        setStore("editing", false);
        return;
      }
      if (keybind.match("input_clear", evt)) {
        evt.preventDefault();
        const text = textarea?.plainText ?? "";
        if (!text) {
          setStore("editing", false);
          return;
        }
        textarea?.setText("");
        return;
      }
      if (evt.name === "return") {
        evt.preventDefault();
        const text = textarea?.plainText?.trim() ?? "";
        const prev = store.custom[store.tab];
        if (!text) {
          if (prev) {
            const inputs = [...store.custom];
            inputs[store.tab] = "";
            setStore("custom", inputs);
            const answers = [...store.answers];
            answers[store.tab] = (answers[store.tab] ?? []).filter(x => x !== prev);
            setStore("answers", answers);
          }
          setStore("editing", false);
          return;
        }
        if (multi()) {
          const inputs = [...store.custom];
          inputs[store.tab] = text;
          setStore("custom", inputs);
          const existing = store.answers[store.tab] ?? [];
          const next = [...existing];
          if (prev) {
            const index = next.indexOf(prev);
            if (index !== -1) next.splice(index, 1);
          }
          if (!next.includes(text)) next.push(text);
          const answers = [...store.answers];
          answers[store.tab] = next;
          setStore("answers", answers);
          setStore("editing", false);
          return;
        }
        pick(text, true);
        setStore("editing", false);
        return;
      }
      // Let textarea handle all other keys
      return;
    }
    if (evt.name === "left" || evt.name === "h") {
      evt.preventDefault();
      selectTab((store.tab - 1 + tabs()) % tabs());
    }
    if (evt.name === "right" || evt.name === "l") {
      evt.preventDefault();
      selectTab((store.tab + 1) % tabs());
    }
    if (evt.name === "tab") {
      evt.preventDefault();
      const direction = evt.shift ? -1 : 1;
      selectTab((store.tab + direction + tabs()) % tabs());
    }
    if (confirm()) {
      if (evt.name === "return") {
        evt.preventDefault();
        submit();
      }
      if (evt.name === "escape" || keybind.match("app_exit", evt)) {
        evt.preventDefault();
        reject();
      }
    } else {
      const opts = options();
      const total = opts.length + (custom() ? 1 : 0);
      const max = Math.min(total, 9);
      const digit = Number(evt.name);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= max) {
        evt.preventDefault();
        const index = digit - 1;
        moveTo(index);
        selectOption();
        return;
      }
      if (evt.name === "up" || evt.name === "k") {
        evt.preventDefault();
        moveTo((store.selected - 1 + total) % total);
      }
      if (evt.name === "down" || evt.name === "j") {
        evt.preventDefault();
        moveTo((store.selected + 1) % total);
      }
      if (evt.name === "return") {
        evt.preventDefault();
        selectOption();
      }
      if (evt.name === "escape" || keybind.match("app_exit", evt)) {
        evt.preventDefault();
        reject();
      }
    }
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$23 = _$createElement("box"),
      _el$24 = _$createElement("box"),
      _el$35 = _$createElement("text"),
      _el$36 = _$createTextNode(`enter `),
      _el$38 = _$createElement("span"),
      _el$39 = _$createElement("text"),
      _el$40 = _$createTextNode(`esc `),
      _el$41 = _$createElement("span");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$23);
    _$setProp(_el$, "border", ["left"]);
    _$setProp(_el$2, "gap", 1);
    _$setProp(_el$2, "paddingLeft", 1);
    _$setProp(_el$2, "paddingRight", 3);
    _$setProp(_el$2, "paddingTop", 1);
    _$setProp(_el$2, "paddingBottom", 1);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return !single();
      },
      get children() {
        var _el$3 = _$createElement("box"),
          _el$4 = _$createElement("box"),
          _el$5 = _$createElement("text");
        _$insertNode(_el$3, _el$4);
        _$setProp(_el$3, "flexDirection", "row");
        _$setProp(_el$3, "gap", 1);
        _$setProp(_el$3, "paddingLeft", 1);
        _$insert(_el$3, _$createComponent(For, {
          get each() {
            return questions();
          },
          children: (q, index) => {
            const isActive = () => index() === store.tab;
            const isAnswered = () => {
              return (store.answers[index()]?.length ?? 0) > 0;
            };
            return (() => {
              var _el$43 = _$createElement("box"),
                _el$44 = _$createElement("text");
              _$insertNode(_el$43, _el$44);
              _$setProp(_el$43, "paddingLeft", 1);
              _$setProp(_el$43, "paddingRight", 1);
              _$setProp(_el$43, "onMouseOver", () => setTabHover(index()));
              _$setProp(_el$43, "onMouseOut", () => setTabHover(null));
              _$setProp(_el$43, "onMouseUp", () => selectTab(index()));
              _$insert(_el$44, () => q.header);
              _$effect(_p$ => {
                var _v$22 = isActive() ? theme.accent : tabHover() === index() ? theme.backgroundElement : theme.backgroundPanel,
                  _v$23 = isActive() ? selectedForeground(theme, theme.accent) : isAnswered() ? theme.text : theme.textMuted;
                _v$22 !== _p$.e && (_p$.e = _$setProp(_el$43, "backgroundColor", _v$22, _p$.e));
                _v$23 !== _p$.t && (_p$.t = _$setProp(_el$44, "fg", _v$23, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$43;
            })();
          }
        }), _el$4);
        _$insertNode(_el$4, _el$5);
        _$setProp(_el$4, "paddingLeft", 1);
        _$setProp(_el$4, "paddingRight", 1);
        _$setProp(_el$4, "onMouseOver", () => setTabHover("confirm"));
        _$setProp(_el$4, "onMouseOut", () => setTabHover(null));
        _$setProp(_el$4, "onMouseUp", () => selectTab(questions().length));
        _$insertNode(_el$5, _$createTextNode(`Confirm`));
        _$effect(_p$ => {
          var _v$ = confirm() ? theme.accent : tabHover() === "confirm" ? theme.backgroundElement : theme.backgroundPanel,
            _v$2 = confirm() ? selectedForeground(theme, theme.accent) : theme.textMuted;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$4, "backgroundColor", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$3;
      }
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return !confirm();
      },
      get children() {
        var _el$7 = _$createElement("box"),
          _el$8 = _$createElement("box"),
          _el$9 = _$createElement("text"),
          _el$0 = _$createElement("box");
        _$insertNode(_el$7, _el$8);
        _$insertNode(_el$7, _el$0);
        _$setProp(_el$7, "paddingLeft", 1);
        _$setProp(_el$7, "gap", 1);
        _$insertNode(_el$8, _el$9);
        _$insert(_el$9, () => question()?.question, null);
        _$insert(_el$9, () => multi() ? " (select all that apply)" : "", null);
        _$insert(_el$0, _$createComponent(For, {
          get each() {
            return options();
          },
          children: (opt, i) => {
            const active = () => i() === store.selected;
            const picked = () => store.answers[store.tab]?.includes(opt.label) ?? false;
            return (() => {
              var _el$45 = _$createElement("box"),
                _el$46 = _$createElement("box"),
                _el$47 = _$createElement("box"),
                _el$48 = _$createElement("text"),
                _el$49 = _$createElement("box"),
                _el$50 = _$createElement("text"),
                _el$52 = _$createElement("box"),
                _el$53 = _$createElement("text");
              _$insertNode(_el$45, _el$46);
              _$insertNode(_el$45, _el$52);
              _$setProp(_el$45, "onMouseOver", () => moveTo(i()));
              _$setProp(_el$45, "onMouseDown", () => moveTo(i()));
              _$setProp(_el$45, "onMouseUp", () => selectOption());
              _$insertNode(_el$46, _el$47);
              _$insertNode(_el$46, _el$49);
              _$setProp(_el$46, "flexDirection", "row");
              _$insertNode(_el$47, _el$48);
              _$setProp(_el$47, "paddingRight", 1);
              _$insert(_el$48, () => `${i() + 1}.`);
              _$insertNode(_el$49, _el$50);
              _$insert(_el$50, (() => {
                var _c$3 = _$memo(() => !!multi());
                return () => _c$3() ? `[${picked() ? "✓" : " "}] ${opt.label}` : opt.label;
              })());
              _$insert(_el$46, _$createComponent(Show, {
                get when() {
                  return !multi();
                },
                get children() {
                  var _el$51 = _$createElement("text");
                  _$insert(_el$51, () => picked() ? "✓" : "");
                  _$effect(_$p => _$setProp(_el$51, "fg", theme.success, _$p));
                  return _el$51;
                }
              }), null);
              _$insertNode(_el$52, _el$53);
              _$setProp(_el$52, "paddingLeft", 3);
              _$insert(_el$53, () => opt.description);
              _$effect(_p$ => {
                var _v$24 = active() ? theme.backgroundElement : undefined,
                  _v$25 = active() ? tint(theme.textMuted, theme.secondary, 0.6) : theme.textMuted,
                  _v$26 = active() ? theme.backgroundElement : undefined,
                  _v$27 = active() ? theme.secondary : picked() ? theme.success : theme.text,
                  _v$28 = theme.textMuted;
                _v$24 !== _p$.e && (_p$.e = _$setProp(_el$47, "backgroundColor", _v$24, _p$.e));
                _v$25 !== _p$.t && (_p$.t = _$setProp(_el$48, "fg", _v$25, _p$.t));
                _v$26 !== _p$.a && (_p$.a = _$setProp(_el$49, "backgroundColor", _v$26, _p$.a));
                _v$27 !== _p$.o && (_p$.o = _$setProp(_el$50, "fg", _v$27, _p$.o));
                _v$28 !== _p$.i && (_p$.i = _$setProp(_el$53, "fg", _v$28, _p$.i));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined,
                i: undefined
              });
              return _el$45;
            })();
          }
        }), null);
        _$insert(_el$0, _$createComponent(Show, {
          get when() {
            return custom();
          },
          get children() {
            var _el$1 = _$createElement("box"),
              _el$10 = _$createElement("box"),
              _el$11 = _$createElement("box"),
              _el$12 = _$createElement("text"),
              _el$13 = _$createElement("box"),
              _el$14 = _$createElement("text");
            _$insertNode(_el$1, _el$10);
            _$setProp(_el$1, "onMouseOver", () => moveTo(options().length));
            _$setProp(_el$1, "onMouseDown", () => moveTo(options().length));
            _$setProp(_el$1, "onMouseUp", () => selectOption());
            _$insertNode(_el$10, _el$11);
            _$insertNode(_el$10, _el$13);
            _$setProp(_el$10, "flexDirection", "row");
            _$insertNode(_el$11, _el$12);
            _$setProp(_el$11, "paddingRight", 1);
            _$insert(_el$12, () => `${options().length + 1}.`);
            _$insertNode(_el$13, _el$14);
            _$insert(_el$14, (() => {
              var _c$ = _$memo(() => !!multi());
              return () => _c$() ? `[${customPicked() ? "✓" : " "}] Type your own answer` : "Type your own answer";
            })());
            _$insert(_el$10, _$createComponent(Show, {
              get when() {
                return !multi();
              },
              get children() {
                var _el$15 = _$createElement("text");
                _$insert(_el$15, () => customPicked() ? "✓" : "");
                _$effect(_$p => _$setProp(_el$15, "fg", theme.success, _$p));
                return _el$15;
              }
            }), null);
            _$insert(_el$1, _$createComponent(Show, {
              get when() {
                return store.editing;
              },
              get children() {
                var _el$16 = _$createElement("box"),
                  _el$17 = _$createElement("textarea");
                _$insertNode(_el$16, _el$17);
                _$setProp(_el$16, "paddingLeft", 3);
                _$use(val => {
                  textarea = val;
                  val.traits = {
                    status: "ANSWER"
                  };
                  queueMicrotask(() => {
                    val.focus();
                    val.gotoLineEnd();
                  });
                }, _el$17);
                _$setProp(_el$17, "placeholder", "Type your own answer");
                _$setProp(_el$17, "minHeight", 1);
                _$setProp(_el$17, "maxHeight", 6);
                _$effect(_p$ => {
                  var _v$3 = input(),
                    _v$4 = theme.textMuted,
                    _v$5 = theme.text,
                    _v$6 = theme.text,
                    _v$7 = theme.primary,
                    _v$8 = bindings();
                  _v$3 !== _p$.e && (_p$.e = _$setProp(_el$17, "initialValue", _v$3, _p$.e));
                  _v$4 !== _p$.t && (_p$.t = _$setProp(_el$17, "placeholderColor", _v$4, _p$.t));
                  _v$5 !== _p$.a && (_p$.a = _$setProp(_el$17, "textColor", _v$5, _p$.a));
                  _v$6 !== _p$.o && (_p$.o = _$setProp(_el$17, "focusedTextColor", _v$6, _p$.o));
                  _v$7 !== _p$.i && (_p$.i = _$setProp(_el$17, "cursorColor", _v$7, _p$.i));
                  _v$8 !== _p$.n && (_p$.n = _$setProp(_el$17, "keyBindings", _v$8, _p$.n));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined,
                  i: undefined,
                  n: undefined
                });
                return _el$16;
              }
            }), null);
            _$insert(_el$1, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!!store.editing)() && input();
              },
              get children() {
                var _el$18 = _$createElement("box"),
                  _el$19 = _$createElement("text");
                _$insertNode(_el$18, _el$19);
                _$setProp(_el$18, "paddingLeft", 3);
                _$insert(_el$19, input);
                _$effect(_$p => _$setProp(_el$19, "fg", theme.textMuted, _$p));
                return _el$18;
              }
            }), null);
            _$effect(_p$ => {
              var _v$9 = other() ? theme.backgroundElement : undefined,
                _v$0 = other() ? tint(theme.textMuted, theme.secondary, 0.6) : theme.textMuted,
                _v$1 = other() ? theme.backgroundElement : undefined,
                _v$10 = other() ? theme.secondary : customPicked() ? theme.success : theme.text;
              _v$9 !== _p$.e && (_p$.e = _$setProp(_el$11, "backgroundColor", _v$9, _p$.e));
              _v$0 !== _p$.t && (_p$.t = _$setProp(_el$12, "fg", _v$0, _p$.t));
              _v$1 !== _p$.a && (_p$.a = _$setProp(_el$13, "backgroundColor", _v$1, _p$.a));
              _v$10 !== _p$.o && (_p$.o = _$setProp(_el$14, "fg", _v$10, _p$.o));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined
            });
            return _el$1;
          }
        }), null);
        _$effect(_$p => _$setProp(_el$9, "fg", theme.text, _$p));
        return _el$7;
      }
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!confirm())() && !single();
      },
      get children() {
        return [(() => {
          var _el$20 = _$createElement("box"),
            _el$21 = _$createElement("text");
          _$insertNode(_el$20, _el$21);
          _$setProp(_el$20, "paddingLeft", 1);
          _$insertNode(_el$21, _$createTextNode(`Review`));
          _$effect(_$p => _$setProp(_el$21, "fg", theme.text, _$p));
          return _el$20;
        })(), _$createComponent(For, {
          get each() {
            return questions();
          },
          children: (q, index) => {
            const value = () => store.answers[index()]?.join(", ") ?? "";
            const answered = () => Boolean(value());
            return (() => {
              var _el$54 = _$createElement("box"),
                _el$55 = _$createElement("text"),
                _el$56 = _$createElement("span"),
                _el$57 = _$createTextNode(`:`),
                _el$58 = _$createTextNode(` `),
                _el$59 = _$createElement("span");
              _$insertNode(_el$54, _el$55);
              _$setProp(_el$54, "paddingLeft", 1);
              _$insertNode(_el$55, _el$56);
              _$insertNode(_el$55, _el$58);
              _$insertNode(_el$55, _el$59);
              _$insertNode(_el$56, _el$57);
              _$insert(_el$56, () => q.header, _el$57);
              _$insert(_el$59, (() => {
                var _c$4 = _$memo(() => !!answered());
                return () => _c$4() ? value() : "(not answered)";
              })());
              _$effect(_p$ => {
                var _v$29 = {
                    fg: theme.textMuted
                  },
                  _v$30 = {
                    fg: answered() ? theme.text : theme.error
                  };
                _v$29 !== _p$.e && (_p$.e = _$setProp(_el$56, "style", _v$29, _p$.e));
                _v$30 !== _p$.t && (_p$.t = _$setProp(_el$59, "style", _v$30, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$54;
            })();
          }
        })];
      }
    }), null);
    _$insertNode(_el$23, _el$24);
    _$setProp(_el$23, "flexDirection", "row");
    _$setProp(_el$23, "flexShrink", 0);
    _$setProp(_el$23, "gap", 1);
    _$setProp(_el$23, "paddingLeft", 2);
    _$setProp(_el$23, "paddingRight", 3);
    _$setProp(_el$23, "paddingBottom", 1);
    _$setProp(_el$23, "justifyContent", "space-between");
    _$insertNode(_el$24, _el$35);
    _$insertNode(_el$24, _el$39);
    _$setProp(_el$24, "flexDirection", "row");
    _$setProp(_el$24, "gap", 2);
    _$insert(_el$24, _$createComponent(Show, {
      get when() {
        return !single();
      },
      get children() {
        var _el$25 = _$createElement("text"),
          _el$26 = _$createTextNode(`⇆ `),
          _el$28 = _$createElement("span");
        _$insertNode(_el$25, _el$26);
        _$insertNode(_el$25, _el$28);
        _$insertNode(_el$28, _$createTextNode(`tab`));
        _$effect(_p$ => {
          var _v$11 = theme.text,
            _v$12 = {
              fg: theme.textMuted
            };
          _v$11 !== _p$.e && (_p$.e = _$setProp(_el$25, "fg", _v$11, _p$.e));
          _v$12 !== _p$.t && (_p$.t = _$setProp(_el$28, "style", _v$12, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$25;
      }
    }), _el$35);
    _$insert(_el$24, _$createComponent(Show, {
      get when() {
        return !confirm();
      },
      get children() {
        var _el$30 = _$createElement("text"),
          _el$31 = _$createTextNode(`↑↓ `),
          _el$33 = _$createElement("span");
        _$insertNode(_el$30, _el$31);
        _$insertNode(_el$30, _el$33);
        _$insertNode(_el$33, _$createTextNode(`select`));
        _$effect(_p$ => {
          var _v$13 = theme.text,
            _v$14 = {
              fg: theme.textMuted
            };
          _v$13 !== _p$.e && (_p$.e = _$setProp(_el$30, "fg", _v$13, _p$.e));
          _v$14 !== _p$.t && (_p$.t = _$setProp(_el$33, "style", _v$14, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$30;
      }
    }), _el$35);
    _$insertNode(_el$35, _el$36);
    _$insertNode(_el$35, _el$38);
    _$insert(_el$38, (() => {
      var _c$2 = _$memo(() => !!confirm());
      return () => _c$2() ? "submit" : _$memo(() => !!multi())() ? "toggle" : single() ? "submit" : "confirm";
    })());
    _$insertNode(_el$39, _el$40);
    _$insertNode(_el$39, _el$41);
    _$insertNode(_el$41, _$createTextNode(`dismiss`));
    _$effect(_p$ => {
      var _v$15 = theme.backgroundPanel,
        _v$16 = theme.accent,
        _v$17 = SplitBorder.customBorderChars,
        _v$18 = theme.text,
        _v$19 = {
          fg: theme.textMuted
        },
        _v$20 = theme.text,
        _v$21 = {
          fg: theme.textMuted
        };
      _v$15 !== _p$.e && (_p$.e = _$setProp(_el$, "backgroundColor", _v$15, _p$.e));
      _v$16 !== _p$.t && (_p$.t = _$setProp(_el$, "borderColor", _v$16, _p$.t));
      _v$17 !== _p$.a && (_p$.a = _$setProp(_el$, "customBorderChars", _v$17, _p$.a));
      _v$18 !== _p$.o && (_p$.o = _$setProp(_el$35, "fg", _v$18, _p$.o));
      _v$19 !== _p$.i && (_p$.i = _$setProp(_el$38, "style", _v$19, _p$.i));
      _v$20 !== _p$.n && (_p$.n = _$setProp(_el$39, "fg", _v$20, _p$.n));
      _v$21 !== _p$.s && (_p$.s = _$setProp(_el$41, "style", _v$21, _p$.s));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined
    });
    return _el$;
  })();
}