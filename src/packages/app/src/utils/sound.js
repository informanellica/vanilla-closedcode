let files;
let loads;
// Build-less replacement for the former Vite `import.meta.glob(...)`.
// The renderer is served via the oc:// protocol; the .aac assets are copied
// (by build.js) from packages/ui/src/assets/audio into out/renderer/assets/audio,
// and reachable at "./assets/audio/<name>.aac" relative to the renderer HTML.
// Shape matches Vite's glob with { import: "default" }: a map of
//   "<relative path>": () => Promise<url-string>
// getLoads() keys these by the trailing filename, so only the basename matters.
const AUDIO_BASE = "./assets/audio";
const AUDIO_FILES = [
  "alert-01", "alert-02", "alert-03", "alert-04", "alert-05",
  "alert-06", "alert-07", "alert-08", "alert-09", "alert-10",
  "bip-bop-01", "bip-bop-02", "bip-bop-03", "bip-bop-04", "bip-bop-05",
  "bip-bop-06", "bip-bop-07", "bip-bop-08", "bip-bop-09", "bip-bop-10",
  "nope-01", "nope-02", "nope-03", "nope-04", "nope-05", "nope-06",
  "nope-07", "nope-08", "nope-09", "nope-10", "nope-11", "nope-12",
  "staplebops-01", "staplebops-02", "staplebops-03", "staplebops-04",
  "staplebops-05", "staplebops-06", "staplebops-07",
  "yup-01", "yup-02", "yup-03", "yup-04", "yup-05", "yup-06",
];
function getFiles() {
  if (files) return files;
  files = Object.fromEntries(
    AUDIO_FILES.map((name) => {
      const url = `${AUDIO_BASE}/${name}.aac`;
      return [url, () => Promise.resolve(url)];
    }),
  );
  return files;
}
export const SOUND_OPTIONS = [{
  id: "alert-01",
  label: "sound.option.alert01"
}, {
  id: "alert-02",
  label: "sound.option.alert02"
}, {
  id: "alert-03",
  label: "sound.option.alert03"
}, {
  id: "alert-04",
  label: "sound.option.alert04"
}, {
  id: "alert-05",
  label: "sound.option.alert05"
}, {
  id: "alert-06",
  label: "sound.option.alert06"
}, {
  id: "alert-07",
  label: "sound.option.alert07"
}, {
  id: "alert-08",
  label: "sound.option.alert08"
}, {
  id: "alert-09",
  label: "sound.option.alert09"
}, {
  id: "alert-10",
  label: "sound.option.alert10"
}, {
  id: "bip-bop-01",
  label: "sound.option.bipbop01"
}, {
  id: "bip-bop-02",
  label: "sound.option.bipbop02"
}, {
  id: "bip-bop-03",
  label: "sound.option.bipbop03"
}, {
  id: "bip-bop-04",
  label: "sound.option.bipbop04"
}, {
  id: "bip-bop-05",
  label: "sound.option.bipbop05"
}, {
  id: "bip-bop-06",
  label: "sound.option.bipbop06"
}, {
  id: "bip-bop-07",
  label: "sound.option.bipbop07"
}, {
  id: "bip-bop-08",
  label: "sound.option.bipbop08"
}, {
  id: "bip-bop-09",
  label: "sound.option.bipbop09"
}, {
  id: "bip-bop-10",
  label: "sound.option.bipbop10"
}, {
  id: "staplebops-01",
  label: "sound.option.staplebops01"
}, {
  id: "staplebops-02",
  label: "sound.option.staplebops02"
}, {
  id: "staplebops-03",
  label: "sound.option.staplebops03"
}, {
  id: "staplebops-04",
  label: "sound.option.staplebops04"
}, {
  id: "staplebops-05",
  label: "sound.option.staplebops05"
}, {
  id: "staplebops-06",
  label: "sound.option.staplebops06"
}, {
  id: "staplebops-07",
  label: "sound.option.staplebops07"
}, {
  id: "nope-01",
  label: "sound.option.nope01"
}, {
  id: "nope-02",
  label: "sound.option.nope02"
}, {
  id: "nope-03",
  label: "sound.option.nope03"
}, {
  id: "nope-04",
  label: "sound.option.nope04"
}, {
  id: "nope-05",
  label: "sound.option.nope05"
}, {
  id: "nope-06",
  label: "sound.option.nope06"
}, {
  id: "nope-07",
  label: "sound.option.nope07"
}, {
  id: "nope-08",
  label: "sound.option.nope08"
}, {
  id: "nope-09",
  label: "sound.option.nope09"
}, {
  id: "nope-10",
  label: "sound.option.nope10"
}, {
  id: "nope-11",
  label: "sound.option.nope11"
}, {
  id: "nope-12",
  label: "sound.option.nope12"
}, {
  id: "yup-01",
  label: "sound.option.yup01"
}, {
  id: "yup-02",
  label: "sound.option.yup02"
}, {
  id: "yup-03",
  label: "sound.option.yup03"
}, {
  id: "yup-04",
  label: "sound.option.yup04"
}, {
  id: "yup-05",
  label: "sound.option.yup05"
}, {
  id: "yup-06",
  label: "sound.option.yup06"
}];
function getLoads() {
  if (loads) return loads;
  loads = Object.fromEntries(Object.entries(getFiles()).flatMap(([path, load]) => {
    const file = path.split("/").at(-1);
    if (!file) return [];
    return [[file.replace(/\.aac$/, ""), load]];
  }));
  return loads;
}
const cache = new Map();
export function soundSrc(id) {
  const loads = getLoads();
  if (!id || !(id in loads)) return Promise.resolve(undefined);
  const key = id;
  const hit = cache.get(key);
  if (hit) return hit;
  const next = loads[key]().catch(() => undefined);
  cache.set(key, next);
  return next;
}
export function playSound(src) {
  if (typeof Audio === "undefined") return;
  if (!src) return;
  const audio = new Audio(src);
  audio.play().catch(() => undefined);
  return () => {
    audio.pause();
    audio.currentTime = 0;
  };
}
export function playSoundById(id) {
  return soundSrc(id).then(src => playSound(src));
}