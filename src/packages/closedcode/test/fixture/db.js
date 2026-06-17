import {  rm  } from "fs/promises"
import {  Database  } from "#storage/db.js"
import {  disposeAllInstances  } from "./fixture.js"
export async function resetDatabase() {
  await disposeAllInstances().catch(() => undefined);
  await Database.closeAsync();
  await rm(Database.Path, { force: true }).catch(() => undefined);
  await rm(`${Database.Path}-wal`, { force: true }).catch(() => undefined);
  await rm(`${Database.Path}-shm`, { force: true }).catch(() => undefined);
}
