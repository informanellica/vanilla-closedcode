import { createSignal } from "solid-js";
const [list, setList] = createSignal([]);
const [focus, setFocus] = createSignal(null);
const [active, setActive] = createSignal(null);
export function useComments() {
  return {
    all: list,
    replace(next) {
      setList(next);
    },
    remove(file, id) {
      setList(current => current.filter(item => !(item.file === file && item.id === id)));
    },
    clear() {
      setList([]);
      setFocus(null);
      setActive(null);
    },
    focus,
    setFocus,
    active,
    setActive
  };
}