#!/usr/bin/env node
/** @file Tiny harness that dynamically imports the module named by the first CLI argument and prints the elapsed time, used to measure a module's load/run cost. */
import path from "path";
const toDynamicallyImport = path.join(process.cwd(), process.argv[2]);
await import(toDynamicallyImport);
console.log(performance.now());