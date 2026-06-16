#!/usr/bin/env node
/** @file Prebuild script that stages channel icons and builds the closedcode Node sidecar before packaging the desktop app. */
import { $ } from "script/shell"
import { resolveChannel } from "./utils.js"
const channel = resolveChannel()
await $`node ./scripts/copy-icons.js ${channel}`
await $`node script/build-node.js`.cwd("../closedcode")
