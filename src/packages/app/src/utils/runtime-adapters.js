const isRecord = value => {
  return typeof value === "object" && value !== null;
};
export const isDisposable = value => {
  return isRecord(value) && typeof value.dispose === "function";
};
export const disposeIfDisposable = value => {
  if (!isDisposable(value)) return;
  value.dispose();
};
export const hasSetOption = value => {
  return isRecord(value) && typeof value.setOption === "function";
};
export const setOptionIfSupported = (value, key, next) => {
  if (!hasSetOption(value)) return;
  value.setOption(key, next);
};
export const getHoveredLinkText = value => {
  if (!isRecord(value)) return;
  const link = value.currentHoveredLink;
  if (!isRecord(link)) return;
  if (typeof link.text !== "string") return;
  return link.text;
};
export const getSpeechRecognitionCtor = value => {
  if (!isRecord(value)) return;
  const ctor = typeof value.webkitSpeechRecognition === "function" ? value.webkitSpeechRecognition : value.SpeechRecognition;
  if (typeof ctor !== "function") return;
  return ctor;
};