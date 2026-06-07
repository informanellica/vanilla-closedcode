// Polyfill for the `node:ffi` API surface that @opentui/core (via
// bun-ffi-structs) expects when running under Node. Backed by `koffi`.
//
// The shape we need to provide:
//   dlopen(pathOrUrl, defs) -> { lib, functions }
//     where defs[name] = { parameters: string[]; result: string }
//     and  functions[name](...args) calls the native symbol
//     and  lib.registerCallback(def, cb) -> bigint pointer
//          lib.unregisterCallback(ptr)
//          lib.close()
//   getRawPointer(buffer) -> bigint
//   toArrayBuffer(pointer, length, copy?) -> ArrayBuffer
//   suffix -> string (platform library suffix; "" is acceptable here)
//
// All argument orders / conversions below were validated empirically against
// koffi 2.16.2 on win32-x64 (see notes inline). The important non-obvious
// facts koffi enforces:
//   * lib.func() takes (name, result, params) -- NAME FIRST, result second.
//   * koffi.register() needs a koffi.pointer(proto), not a bare proto.
//   * koffi.view()/decode() require a koffi EXTERNAL pointer, not a raw BigInt;
//     a BigInt address must first be turned into a pointer object by writing it
//     into an 8-byte buffer and decoding that buffer as "void *".
//   * A BigInt is, however, accepted directly as a "void *"/pointer *argument*
//     to a native call, so getRawPointer()/registerCallback() can return BigInt.

import koffi from "koffi";

const TYPE_MAP = {
  char: "char",
  i8: "int8_t",
  u8: "uint8_t",
  i16: "int16_t",
  u16: "uint16_t",
  i32: "int32_t",
  u32: "uint32_t",
  i64: "int64_t",
  u64: "uint64_t",
  f32: "float",
  f64: "double",
  bool: "bool",
  pointer: "void *",
  void: "void",
  // @opentui maps FFIType.cstring -> "string" (parameters only).
  string: "str",
  // @opentui maps FFIType.buffer -> "buffer"; a uint8 pointer accepts a
  // Buffer / TypedArray argument.
  buffer: "uint8_t *"
};

function toKoffiType(t) {
  const out = TYPE_MAP[t];
  if (!out) throw new Error(`Unsupported node:ffi type: ${t}`);
  return out;
}

// koffi requires an external pointer object for view()/decode(); a raw BigInt
// address is rejected. Materialize one by round-tripping the address through an
// 8-byte little-endian buffer decoded as "void *".
function toExternalPointer(pointer) {
  const addr = typeof pointer === "bigint" ? pointer : BigInt(pointer);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(addr & 0xffffffffffffffffn);
  return koffi.decode(buf, "void *");
}

function dlopen(path, definitions) {
  if (process.env.CC_DEBUG_FFI)
    console.error("[ffi-polyfill] dlopen:", path, Object.keys(definitions).length, "symbols");
  const koffiLib = koffi.load(path);
  const functions = {};
  for (const [name, def] of Object.entries(definitions)) {
    const params = def.parameters.map(toKoffiType);
    const ret = toKoffiType(def.result);
    // koffi signature is func(name, result, params) -- name FIRST.
    const fn = koffiLib.func(name, ret, params);
    functions[name] = fn;
  }
  if (process.env.CC_DEBUG_FFI) console.error("[ffi-polyfill] dlopen done");

  // Map address(BigInt) -> koffi callback handle so unregisterCallback() can
  // find the handle to release from the BigInt pointer @opentui hands back.
  const callbacks = new Map();
  let callbackSeq = 0;

  const lib = {
    registerCallback(def, callback) {
      const params = def.parameters.map(toKoffiType);
      const ret = toKoffiType(def.result);
      // Unique, monotonically increasing proto name -- using a live count would
      // collide after an unregister frees an earlier slot.
      const proto = koffi.proto(`__closedcode_cb_${callbackSeq++}`, ret, params);
      // koffi.register requires a pointer-to-proto, not the bare proto.
      const handle = koffi.register(callback, koffi.pointer(proto));
      const addr = koffi.address(handle);
      const asBig = typeof addr === "bigint" ? addr : BigInt(addr);
      callbacks.set(asBig, handle);
      return asBig;
    },
    unregisterCallback(ptr) {
      const key = typeof ptr === "bigint" ? ptr : BigInt(ptr);
      const handle = callbacks.get(key);
      if (handle) {
        try {
          koffi.unregister(handle);
        } catch {
          // ignore
        }
        callbacks.delete(key);
      }
    },
    close() {
      for (const handle of callbacks.values()) {
        try {
          koffi.unregister(handle);
        } catch {
          // ignore
        }
      }
      callbacks.clear();
      try {
        // koffi.load() has no explicit close in current versions; rely on GC.
        koffiLib.unload?.();
      } catch {
        // ignore
      }
    }
  };
  return {
    lib,
    functions
  };
}

function getRawPointer(buf) {
  let view;
  if (buf instanceof ArrayBuffer) {
    view = new Uint8Array(buf);
  } else if (ArrayBuffer.isView(buf)) {
    view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    throw new TypeError("getRawPointer requires ArrayBuffer or ArrayBufferView");
  }
  const addr = koffi.address(view);
  return typeof addr === "bigint" ? addr : BigInt(addr);
}

function toArrayBuffer(pointer, length, copy) {
  const ptr = toExternalPointer(pointer);
  if (!length) return new ArrayBuffer(0);
  // @opentui calls this with copy=false and expects a zero-copy view aliasing
  // native memory (render buffers are re-read every frame). koffi.view gives
  // exactly that. Some runtimes (notably Electron) forbid external buffers and
  // throw -- fall back to a copy via decode in that case.
  if (copy === false) {
    try {
      return koffi.view(ptr, length);
    } catch {
      // fall through to copy
    }
  }
  const arr = koffi.decode(ptr, "uint8_t", length);
  const out = new ArrayBuffer(length);
  new Uint8Array(out).set(arr);
  return out;
}

// Platform library suffix. bun-ffi-structs reads `nodeFfi.suffix` at module
// top-level; @opentui only uses it cosmetically when normalizing lib paths, so
// an empty string (matching the bun-ffi stub) is sufficient here.
const suffix = "";

const nodeFfi = {
  dlopen,
  getRawPointer,
  toArrayBuffer,
  suffix
};

// Install onto globalThis so the patched @opentui/core can find it via
// importModule() at top-level, before any of our own setup code runs.
globalThis.__closedcodeNodeFfi ??= nodeFfi;
if (process.env.CC_DEBUG_FFI) console.error("[ffi-polyfill] installed on globalThis");

export default nodeFfi;
export { dlopen, getRawPointer, toArrayBuffer, suffix };
