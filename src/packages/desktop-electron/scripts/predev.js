/** @file Predev build step: copies channel icons and builds the closedcode Node sidecar before `npm run dev`. */
import { $ } from "script/shell"
await $`node ./scripts/copy-icons.js ${process.env.CLOSEDCODE_CHANNEL ?? "dev"}`
await $`node script/build-node.js`.cwd("../closedcode")
