// Stub for bun:ffi. Only used at bundle-time so esbuild can resolve the
// import; at runtime the bun-ffi-structs `isBun` check stays false and this
// module is never actually called into.

export const dlopen = () => {
  throw new Error("bun:ffi is not available in Node builds.");
};
export const ptr = dlopen;
export const toArrayBuffer = dlopen;
export const suffix = "";
export const FFIType = {};
export const read = dlopen;
export const CString = class {};
export const JSCallback = class {
  constructor() {}
  close() {}
};