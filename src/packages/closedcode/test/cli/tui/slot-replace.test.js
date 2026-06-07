let _$template;
let _$insert;
let _$createComponent;
var _tmpl$ = /*#__PURE__*/_$template(`<box>`);
/** @jsxImportSource @opentui/solid */
import {  template as _$template  } from "@opentui/solid"
import {  insert as _$insert  } from "@opentui/solid"
import {  createComponent as _$createComponent  } from "@opentui/solid"
import {  createSlot, createSolidSlotRegistry, testRender, useRenderer  } from "@opentui/solid"
import {  onMount  } from "solid-js"
import {  expect, test, beforeAll  } from "@jest/globals"
test("replace slot mounts plugin content once", async () => {
  let mounts = 0;
  const Probe = () => {
    onMount(() => {
      mounts += 1;
    });
    return _tmpl$();
  };
  const App = () => {
    const renderer = useRenderer();
    const reg = createSolidSlotRegistry(renderer, {});
    const Slot = createSlot(reg);
    reg.register({
      id: "plugin",
      slots: {
        prompt() {
          return _$createComponent(Probe, {});
        }
      }
    });
    return (() => {
      var _el$2 = _tmpl$();
      _$insert(_el$2, _$createComponent(Slot, {
        name: "prompt",
        mode: "replace",
        get children() {
          return _tmpl$();
        }
      }));
      return _el$2;
    })();
  };
  await testRender(() => _$createComponent(App, {}));
  expect(mounts).toBe(1);
});