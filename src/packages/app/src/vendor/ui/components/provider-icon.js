import { iconNames } from "./provider-icons/types.js";
const sprite = "./provider-icons/sprite.svg";
export const ProviderIcon = props => {
  const el = document.createElement("svg");
  el.setAttribute("data-component", "provider-icon");
  const useEl = document.createElement("use");
  el.appendChild(useEl);
  const id = props.id || "synthetic";
  const resolved = iconNames.includes(id) ? id : "synthetic";
  useEl.setAttribute("href", `${sprite}#${resolved}`);
  if (props.class) {
    el.classList.add(props.class);
  }
  if (props.classList) {
    Object.keys(props.classList).forEach(className => {
      if (props.classList[className]) {
        el.classList.add(className);
      }
    });
  }
  return el;
};
