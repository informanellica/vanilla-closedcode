import { Effect, Layer, Option, Schema, Context } from "effect";
import { Database } from "#storage/db.js";
import { AccountRepoError, Info } from "./schema.js";
import { normalizeServerUrl } from "./url.js";
const ACCOUNT_STATE_ID = 1;
// Sequelize call-site conventions (ORM migration S3, exemplar module):
// - Database.useAsync / transactionAsync hand a handle { models, sequelize, tx };
//   every model call passes { transaction: h.tx } (undefined outside a tx).
// - Reads return plain rows via instance.get({ plain: true }) so the schema
//   decoders keep receiving plain objects with JSON columns parsed.
// - drizzle onConflictDoUpdate -> model.upsert().
const plain = row => (row == null ? undefined : row.get({ plain: true }));
export class Service extends Context.Service()("@closedcode/AccountRepo") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const decode = Schema.decodeUnknownSync(Info);
  const query = f => Effect.tryPromise({
    try: () => Database.useAsync(f),
    catch: cause => new AccountRepoError({
      message: "Database operation failed",
      cause
    })
  });
  const tx = f => Effect.tryPromise({
    try: () => Database.transactionAsync(f),
    catch: cause => new AccountRepoError({
      message: "Database operation failed",
      cause
    })
  });
  const current = async h => {
    const state = plain(await h.models.AccountState.findByPk(ACCOUNT_STATE_ID, { transaction: h.tx }));
    if (!state?.active_account_id) return;
    const account = plain(await h.models.Account.findByPk(state.active_account_id, { transaction: h.tx }));
    if (!account) return;
    return {
      ...account,
      active_org_id: state.active_org_id ?? null
    };
  };
  const state = (h, accountID, orgID) => {
    const id = Option.getOrNull(orgID);
    return h.models.AccountState.upsert({
      id: ACCOUNT_STATE_ID,
      active_account_id: accountID,
      active_org_id: id
    }, { transaction: h.tx });
  };
  const active = Effect.fn("AccountRepo.active")(() => query(h => current(h)).pipe(Effect.map(row => row ? Option.some(decode(row)) : Option.none())));
  const list = Effect.fn("AccountRepo.list")(() => query(async h => {
    const rows = await h.models.Account.findAll({ transaction: h.tx });
    return rows.map(row => decode({
      ...plain(row),
      active_org_id: null
    }));
  }));
  const remove = Effect.fn("AccountRepo.remove")(accountID => tx(async h => {
    await h.models.AccountState.update({
      active_account_id: null,
      active_org_id: null
    }, { where: { active_account_id: accountID }, transaction: h.tx });
    await h.models.Account.destroy({ where: { id: accountID }, transaction: h.tx });
  }).pipe(Effect.asVoid));
  const use = Effect.fn("AccountRepo.use")((accountID, orgID) => query(h => state(h, accountID, orgID)).pipe(Effect.asVoid));
  const getRow = Effect.fn("AccountRepo.getRow")(accountID => query(async h => plain(await h.models.Account.findByPk(accountID, { transaction: h.tx }))).pipe(Effect.map(Option.fromNullishOr)));
  const persistToken = Effect.fn("AccountRepo.persistToken")(input => query(h => h.models.Account.update({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_expiry: Option.getOrNull(input.expiry)
  }, { where: { id: input.accountID }, transaction: h.tx })).pipe(Effect.asVoid));
  const persistAccount = Effect.fn("AccountRepo.persistAccount")(input => tx(async h => {
    const url = normalizeServerUrl(input.url);
    await h.models.Account.upsert({
      id: input.id,
      email: input.email,
      url,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expiry: input.expiry
    }, { transaction: h.tx });
    await state(h, input.id, input.orgID);
  }).pipe(Effect.asVoid));
  return Service.of({
    active,
    list,
    remove,
    use,
    getRow,
    persistToken,
    persistAccount
  });
}));
export * as AccountRepo from "./repo.js";
