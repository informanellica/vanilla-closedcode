#!/usr/bin/env node
import { $ } from "script/shell"
import { resolveChannel } from "./utils.js"
const channel = resolveChannel()
await $`node ./scripts/copy-icons.js ${channel}`
await $`node script/build-node.js`.cwd("../closedcode")
