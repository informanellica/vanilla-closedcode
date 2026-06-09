function split(text) {
  const match = /{{\s*count\s*}}/.exec(text);
  if (!match || match.index === undefined) return { before: "", after: text };
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + match[0].length)
  };
}

function common(one, other) {
  const a = Array.from(one);
  const b = Array.from(other);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {
    stem: a.slice(0, i).join(""),
    one: a.slice(i).join(""),
    other: b.slice(i).join("")
  };
}

export function AnimatedCountLabel(props) {
  const one = split(props.one);
  const other = split(props.other);
  const singular = Math.round(props.count) === 1;
  const active = singular ? one : other;
  const suffix = common(one.after, other.after);
  const splitSuffix = one.before === other.before && (one.after.startsWith(other.after) || other.after.startsWith(one.after));
  const before = splitSuffix ? one.before : active.before;
  const stem = splitSuffix ? suffix.stem : active.after;
  const tail = splitSuffix ? (singular ? suffix.one : suffix.other) : "";

  const root = document.createElement("span");
  root.setAttribute("data-component", "tool-count-label");
  if (props.class) root.classList.add(...String(props.class).split(/\s+/).filter(Boolean));

  const beforeEl = document.createElement("span");
  beforeEl.setAttribute("data-slot", "tool-count-label-before");
  beforeEl.textContent = before;

  const wordEl = document.createElement("span");
  wordEl.setAttribute("data-slot", "tool-count-label-word");

  const stemEl = document.createElement("span");
  stemEl.setAttribute("data-slot", "tool-count-label-stem");
  stemEl.textContent = stem;

  const suffixEl = document.createElement("span");
  suffixEl.setAttribute("data-slot", "tool-count-label-suffix");

  const suffixInner = document.createElement("span");
  suffixInner.setAttribute("data-slot", "tool-count-label-suffix-inner");
  suffixInner.textContent = tail;

  suffixEl.appendChild(suffixInner);
  wordEl.appendChild(stemEl);
  wordEl.appendChild(suffixEl);
  root.appendChild(beforeEl);
  const countEl = document.createElement("span");
  countEl.setAttribute("data-slot", "tool-count-label-count");
  countEl.textContent = String(Math.round(props.count));
  root.appendChild(countEl);
  root.appendChild(wordEl);
  return root;
}
