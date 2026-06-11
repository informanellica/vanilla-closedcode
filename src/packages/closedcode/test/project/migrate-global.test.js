import {  tmpdir  } from "../fixture/fixture.js"
import {  Effect  } from "effect"
import {  Project  } from "#project/project.js"
import {  Database  } from "#storage/db.js"
import {  ProjectID  } from "../../src/project/schema.js"
import {  SessionID  } from "../../src/session/schema.js"
import * as Log from "core/util/log";
import {  $  } from "script/shell"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
Log.init({
  print: false
});
function run(fn) {
  return Effect.runPromise(Effect.gen(function* () {
    const svc = yield* Project.Service;
    return yield* fn(svc);
  }).pipe(Effect.provide(Project.defaultLayer)));
}
function uid() {
  return SessionID.make(crypto.randomUUID());
}
// Project moved to the Sequelize layer (ORM migration S3) — fixtures must
// seed/read the SAME database (with :memory:, the legacy sync layer and the
// async layer hold two different databases).
function seed(opts) {
  const now = Date.now();
  return Database.useAsync(h => h.models.Session.create({
    id: opts.id,
    project_id: opts.project,
    slug: opts.id,
    directory: opts.dir,
    title: "test",
    version: "0.0.0-test",
    time_created: now,
    time_updated: now
  }, { transaction: h.tx }));
}
function ensureGlobal() {
  const now = Date.now();
  return Database.useAsync(h => h.sequelize.query("INSERT OR IGNORE INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES (?, ?, ?, ?, ?)", {
    replacements: [ProjectID.global, "/", now, now, JSON.stringify([])],
    transaction: h.tx
  }));
}
function getSession(id) {
  return Database.useAsync(async h => {
    const row = await h.models.Session.findOne({ where: { id }, transaction: h.tx });
    return row == null ? undefined : row.get({ plain: true });
  });
}
describe("migrateFromGlobal", () => {
  test("migrates global sessions on first project creation", async () => {
    // 1. Start with git init but no commits — creates "global" project row
    await using tmp = await tmpdir();
    await $`git init`.cwd(tmp.path).quiet();
    await $`git config user.name "Test"`.cwd(tmp.path).quiet();
    await $`git config user.email "test@opencode.test"`.cwd(tmp.path).quiet();
    await $`git config commit.gpgsign false`.cwd(tmp.path).quiet();
    const {
      project: pre
    } = await run(svc => svc.fromDirectory(tmp.path));
    expect(pre.id).toBe(ProjectID.global);

    // 2. Seed a session under "global" with matching directory
    const id = uid();
    await seed({
      id,
      dir: tmp.path,
      project: ProjectID.global
    });

    // 3. Make a commit so the project gets a real ID
    await $`git commit --allow-empty -m "root"`.cwd(tmp.path).quiet();
    const {
      project: real
    } = await run(svc => svc.fromDirectory(tmp.path));
    expect(real.id).not.toBe(ProjectID.global);

    // 4. The session should have been migrated to the real project ID
    const row = await getSession(id);
    expect(row).toBeDefined();
    expect(row.project_id).toBe(real.id);
  });
  test("migrates global sessions even when project row already exists", async () => {
    // 1. Create a repo with a commit — real project ID created immediately
    await using tmp = await tmpdir({
      git: true
    });
    const {
      project
    } = await run(svc => svc.fromDirectory(tmp.path));
    expect(project.id).not.toBe(ProjectID.global);

    // 2. Ensure "global" project row exists (as it would from a prior no-git session)
    await ensureGlobal();

    // 3. Seed a session under "global" with matching directory.
    //    This simulates a session created before git init that wasn't
    //    present when the real project row was first created.
    const id = uid();
    await seed({
      id,
      dir: tmp.path,
      project: ProjectID.global
    });

    // 4. Call fromDirectory again — project row already exists,
    //    so the current code skips migration entirely. This is the bug.
    await run(svc => svc.fromDirectory(tmp.path));
    const row = await getSession(id);
    expect(row).toBeDefined();
    expect(row.project_id).toBe(project.id);
  });
  test("does not claim sessions with empty directory", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const {
      project
    } = await run(svc => svc.fromDirectory(tmp.path));
    expect(project.id).not.toBe(ProjectID.global);
    await ensureGlobal();

    // Legacy sessions may lack a directory value.
    // Without a matching origin directory, they should remain global.
    const id = uid();
    await seed({
      id,
      dir: "",
      project: ProjectID.global
    });
    await run(svc => svc.fromDirectory(tmp.path));
    const row = await getSession(id);
    expect(row).toBeDefined();
    expect(row.project_id).toBe(ProjectID.global);
  });
  test("does not steal sessions from unrelated directories", async () => {
    await using tmp = await tmpdir({
      git: true
    });
    const {
      project
    } = await run(svc => svc.fromDirectory(tmp.path));
    expect(project.id).not.toBe(ProjectID.global);
    await ensureGlobal();

    // Seed a session under "global" but for a DIFFERENT directory
    const id = uid();
    await seed({
      id,
      dir: "/some/other/dir",
      project: ProjectID.global
    });
    await run(svc => svc.fromDirectory(tmp.path));
    const row = await getSession(id);
    expect(row).toBeDefined();
    // Should remain under "global" — not stolen
    expect(row.project_id).toBe(ProjectID.global);
  });
});