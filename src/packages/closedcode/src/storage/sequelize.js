// Sequelize mapping layer over the EXISTING closedcode.db schema (ORM
// migration milestone, stage S1). The SQL migration journal in db.js remains
// the single source of schema truth — these models are mappers only:
// timestamps:false, explicit tableName, attributes mirroring *.sql.js.
// `sequelize.sync()` must never be called.
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";

// sequelize v6 is CJS; load via require so build-less ESM works everywhere.
const require = createRequire(import.meta.url);
const { Sequelize, DataTypes, Op } = require("sequelize");

export { DataTypes, Op, Sequelize };

// drizzle's Timestamps helper: time_created defaults to Date.now() on insert,
// time_updated is set on every insert/update ($onUpdate semantics).
// NOTE: Sequelize mutates attribute descriptor objects (adds field/fieldName)
// during define() — sharing one descriptor between attributes silently aliases
// columns (e.g. `email AS worktree`). Always hand out fresh objects.
const TIMESTAMPS = () => ({
  time_created: { type: DataTypes.INTEGER, allowNull: false },
  time_updated: { type: DataTypes.INTEGER, allowNull: false },
});
function wireTimestamps(model) {
  // beforeValidate (not beforeCreate): notNull validation runs BEFORE the
  // create hooks, so the values must exist by validation time. Fires for both
  // creates and updates; time_created is only filled when absent.
  model.beforeValidate(instance => {
    const now = Date.now();
    if (instance.isNewRecord && instance.get("time_created") == null) instance.set("time_created", now);
    instance.set("time_updated", now);
  });
  model.beforeBulkCreate(instances => {
    const now = Date.now();
    for (const instance of instances) {
      if (instance.get("time_created") == null) instance.set("time_created", now);
      instance.set("time_updated", now);
    }
  });
}

// JSON columns: drizzle's { mode: "json" } stores JSON.stringify-ed TEXT.
// DataTypes.JSON on sqlite does the same physical encoding.
const JSON_COL = () => ({ type: DataTypes.JSON });
const JSON_NN = () => ({ type: DataTypes.JSON, allowNull: false });
const TEXT_PK = () => ({ type: DataTypes.TEXT, primaryKey: true });
const TEXT_NN = () => ({ type: DataTypes.TEXT, allowNull: false });

export function createSequelize(storagePath) {
  const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: storagePath,
    logging: process.env.CLOSEDCODE_ORM_LOG ? q => require("node:fs").appendFileSync(process.env.CLOSEDCODE_ORM_LOG, q.slice(0, 500) + String.fromCharCode(10)) : false,
    define: { timestamps: false, freezeTableName: true, underscored: false },
    // single connection: sqlite + WAL; mirrors the previous DatabaseSync usage
    pool: { max: 1, min: 0, idle: 60_000 },
  });

  const models = defineModels(sequelize);
  return { sequelize, models };
}

function defineModels(sequelize) {
  const define = (name, table, attributes, options = {}) =>
    sequelize.define(name, attributes, { tableName: table, ...options });

  const Account = define("Account", "account", {
    id: TEXT_PK(),
    email: TEXT_NN(),
    url: TEXT_NN(),
    access_token: TEXT_NN(),
    refresh_token: TEXT_NN(),
    token_expiry: { type: DataTypes.INTEGER },
    ...TIMESTAMPS(),
  });
  wireTimestamps(Account);

  const AccountState = define("AccountState", "account_state", {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    active_account_id: { type: DataTypes.TEXT },
    active_org_id: { type: DataTypes.TEXT },
  });

  // LEGACY control_account (composite pk email+url)
  const ControlAccount = define("ControlAccount", "control_account", {
    email: { type: DataTypes.TEXT, primaryKey: true },
    url: { type: DataTypes.TEXT, primaryKey: true },
    access_token: TEXT_NN(),
    refresh_token: TEXT_NN(),
    token_expiry: { type: DataTypes.INTEGER },
    active: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ...TIMESTAMPS(),
  });
  wireTimestamps(ControlAccount);

  const Project = define("Project", "project", {
    id: TEXT_PK(),
    worktree: TEXT_NN(),
    vcs: { type: DataTypes.TEXT },
    name: { type: DataTypes.TEXT },
    icon_url: { type: DataTypes.TEXT },
    icon_url_override: { type: DataTypes.TEXT },
    icon_color: { type: DataTypes.TEXT },
    ...TIMESTAMPS(),
    time_initialized: { type: DataTypes.INTEGER },
    sandboxes: JSON_NN(),
    commands: JSON_COL(),
  });
  wireTimestamps(Project);

  const Session = define("Session", "session", {
    id: TEXT_PK(),
    project_id: TEXT_NN(),
    workspace_id: { type: DataTypes.TEXT },
    parent_id: { type: DataTypes.TEXT },
    slug: TEXT_NN(),
    directory: TEXT_NN(),
    path: { type: DataTypes.TEXT },
    title: TEXT_NN(),
    version: TEXT_NN(),
    share_url: { type: DataTypes.TEXT },
    summary_additions: { type: DataTypes.INTEGER },
    summary_deletions: { type: DataTypes.INTEGER },
    summary_files: { type: DataTypes.INTEGER },
    summary_diffs: JSON_COL(),
    revert: JSON_COL(),
    permission: JSON_COL(),
    agent: { type: DataTypes.TEXT },
    model: JSON_COL(),
    ...TIMESTAMPS(),
    time_compacting: { type: DataTypes.INTEGER },
    time_archived: { type: DataTypes.INTEGER },
  });
  wireTimestamps(Session);

  const Message = define("Message", "message", {
    id: TEXT_PK(),
    session_id: TEXT_NN(),
    ...TIMESTAMPS(),
    data: JSON_NN(),
  });
  wireTimestamps(Message);

  const Part = define("Part", "part", {
    id: TEXT_PK(),
    message_id: TEXT_NN(),
    session_id: TEXT_NN(),
    ...TIMESTAMPS(),
    data: JSON_NN(),
  });
  wireTimestamps(Part);

  const Todo = define("Todo", "todo", {
    session_id: { type: DataTypes.TEXT, primaryKey: true },
    content: TEXT_NN(),
    status: TEXT_NN(),
    priority: TEXT_NN(),
    position: { type: DataTypes.INTEGER, primaryKey: true },
    ...TIMESTAMPS(),
  });
  wireTimestamps(Todo);

  const SessionMessage = define("SessionMessage", "session_message", {
    id: TEXT_PK(),
    session_id: TEXT_NN(),
    type: TEXT_NN(),
    ...TIMESTAMPS(),
    data: JSON_NN(),
  });
  wireTimestamps(SessionMessage);

  const Permission = define("Permission", "permission", {
    project_id: TEXT_PK(),
    ...TIMESTAMPS(),
    data: JSON_NN(),
  });
  wireTimestamps(Permission);

  const SessionShare = define("SessionShare", "session_share", {
    session_id: TEXT_PK(),
    id: TEXT_NN(),
    secret: TEXT_NN(),
    url: TEXT_NN(),
    ...TIMESTAMPS(),
  });
  wireTimestamps(SessionShare);

  const EventSequence = define("EventSequence", "event_sequence", {
    aggregate_id: TEXT_PK(),
    seq: { type: DataTypes.INTEGER, allowNull: false },
  });

  const Event = define("Event", "event", {
    id: TEXT_PK(),
    aggregate_id: TEXT_NN(),
    seq: { type: DataTypes.INTEGER, allowNull: false },
    type: TEXT_NN(),
    data: JSON_NN(),
  });

  const Workspace = define("Workspace", "workspace", {
    id: TEXT_PK(),
    type: TEXT_NN(),
    name: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    branch: { type: DataTypes.TEXT },
    directory: { type: DataTypes.TEXT },
    extra: JSON_COL(),
    project_id: TEXT_NN(),
  });

  return {
    Account, AccountState, ControlAccount,
    Project, Session, Message, Part, Todo, SessionMessage, Permission,
    SessionShare, EventSequence, Event, Workspace,
  };
}

// Ambient (continuation-local) transaction support — the async successor of
// db.js's LocalContext design. (Sequelize v6's useCLS expects a cls-hooked
// namespace, not AsyncLocalStorage, so the ambient handle is implemented in
// the Database wrapper itself: it stores { tx, effects } here and hands the
// transaction to callbacks, which pass it via the standard `transaction`
// query option.)
export const transactionStorage = new AsyncLocalStorage();
