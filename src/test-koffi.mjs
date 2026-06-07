import koffi from "koffi"
console.log("koffi loaded", typeof koffi, typeof koffi.load)
const lib = koffi.load("./node_modules/@opentui/core-darwin-arm64/libopentui.dylib")
console.log("lib loaded", typeof lib)
