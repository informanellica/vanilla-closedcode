import { $ } from "script/shell"
await $`node ./scripts/copy-icons.js ${process.env.CLOSEDCODE_CHANNEL ?? "dev"}`
await $`node script/build-node.js`.cwd("../closedcode")
