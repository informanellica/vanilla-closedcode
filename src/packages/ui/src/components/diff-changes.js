import { template as _$template } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg xmlns=http://www.w3.org/2000/svg viewBox="0 0 18 14"fill=none><g>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=diff-changes-additions>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span data-slot=diff-changes-deletions>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-component=diff-changes>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<svg><rect width=2 height=14 rx=1></svg>`, false, true, false);
import { createMemo, For, Match, Show, Switch } from "solid-js";
export function DiffChanges(props) {
  const variant = () => props.variant ?? "default";
  const additions = createMemo(() => Array.isArray(props.changes) ? props.changes.reduce((acc, diff) => acc + (diff.additions ?? 0), 0) : props.changes.additions);
  const deletions = createMemo(() => Array.isArray(props.changes) ? props.changes.reduce((acc, diff) => acc + (diff.deletions ?? 0), 0) : props.changes.deletions);
  const total = createMemo(() => (additions() ?? 0) + (deletions() ?? 0));
  const blockCounts = createMemo(() => {
    const TOTAL_BLOCKS = 5;
    const adds = additions() ?? 0;
    const dels = deletions() ?? 0;
    if (adds === 0 && dels === 0) {
      return {
        added: 0,
        deleted: 0,
        neutral: TOTAL_BLOCKS
      };
    }
    const total = adds + dels;
    if (total < 5) {
      const added = adds > 0 ? 1 : 0;
      const deleted = dels > 0 ? 1 : 0;
      const neutral = TOTAL_BLOCKS - added - deleted;
      return {
        added,
        deleted,
        neutral
      };
    }
    const ratio = adds > dels ? adds / dels : dels / adds;
    let BLOCKS_FOR_COLORS = TOTAL_BLOCKS;
    if (total < 20) {
      BLOCKS_FOR_COLORS = TOTAL_BLOCKS - 1;
    } else if (ratio < 4) {
      BLOCKS_FOR_COLORS = TOTAL_BLOCKS - 1;
    }
    const percentAdded = adds / total;
    const percentDeleted = dels / total;
    const added_raw = percentAdded * BLOCKS_FOR_COLORS;
    const deleted_raw = percentDeleted * BLOCKS_FOR_COLORS;
    let added = adds > 0 ? Math.max(1, Math.round(added_raw)) : 0;
    let deleted = dels > 0 ? Math.max(1, Math.round(deleted_raw)) : 0;

    // Cap bars based on actual change magnitude
    if (adds > 0 && adds <= 5) added = Math.min(added, 1);
    if (adds > 5 && adds <= 10) added = Math.min(added, 2);
    if (dels > 0 && dels <= 5) deleted = Math.min(deleted, 1);
    if (dels > 5 && dels <= 10) deleted = Math.min(deleted, 2);
    let total_allocated = added + deleted;
    if (total_allocated > BLOCKS_FOR_COLORS) {
      if (added_raw > deleted_raw) {
        added = BLOCKS_FOR_COLORS - deleted;
      } else {
        deleted = BLOCKS_FOR_COLORS - added;
      }
      total_allocated = added + deleted;
    }
    const neutral = Math.max(0, TOTAL_BLOCKS - total_allocated);
    return {
      added,
      deleted,
      neutral
    };
  });
  const ADD_COLOR = "var(--icon-diff-add-base)";
  const DELETE_COLOR = "var(--icon-diff-delete-base)";
  const NEUTRAL_COLOR = "var(--icon-weak-base)";
  const visibleBlocks = createMemo(() => {
    const counts = blockCounts();
    const blocks = [...Array(counts.added).fill(ADD_COLOR), ...Array(counts.deleted).fill(DELETE_COLOR), ...Array(counts.neutral).fill(NEUTRAL_COLOR)];
    return blocks.slice(0, 5);
  });
  return _$createComponent(Show, {
    get when() {
      return _$memo(() => variant() === "default")() ? total() > 0 : true;
    },
    get children() {
      var _el$ = _tmpl$4();
      _$insert(_el$, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return variant() === "bars";
            },
            get children() {
              var _el$2 = _tmpl$(),
                _el$3 = _el$2.firstChild;
              _$insert(_el$3, _$createComponent(For, {
                get each() {
                  return visibleBlocks();
                },
                children: (color, i) => (() => {
                  var _el$6 = _tmpl$5();
                  _$setAttribute(_el$6, "fill", color);
                  _$effect(() => _$setAttribute(_el$6, "x", i() * 4));
                  return _el$6;
                })()
              }));
              return _el$2;
            }
          }), _$createComponent(Match, {
            get when() {
              return variant() === "default";
            },
            get children() {
              return [(() => {
                var _el$4 = _tmpl$2();
                _$insert(_el$4, () => `+${additions()}`);
                return _el$4;
              })(), (() => {
                var _el$5 = _tmpl$3();
                _$insert(_el$5, () => `-${deletions()}`);
                return _el$5;
              })()];
            }
          })];
        }
      }));
      _$effect(_p$ => {
        var _v$ = variant(),
          _v$2 = {
            [props.class ?? ""]: true
          };
        _v$ !== _p$.e && _$setAttribute(_el$, "data-variant", _p$.e = _v$);
        _p$.t = _$classList(_el$, _v$2, _p$.t);
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$;
    }
  });
}