/** @file Probe script that verifies the koffi FFI binding loads and can open the bundled darwin-arm64 libopentui dynamic library. */
import koffi from "koffi"
console.log("koffi loaded", typeof koffi, typeof koffi.load)
const lib = koffi.load("./node_modules/@opentui/core-darwin-arm64/libopentui.dylib")
console.log("lib loaded", typeof lib)
