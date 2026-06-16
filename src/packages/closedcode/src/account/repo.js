/** @file Account repository: Sequelize-backed persistence for accounts and the active-account/org selection. */
import { Effect, Layer, Option, Schema, Context } from "effect";
import { Database } from "#storage/db.js";
import { AccountRepoError, Info } from "./schema.js";
import { normalizeServerUrl } from "./url.js";
/** Fixed primary key for the singleton row that tracks the active account/org. */
const ACCOUNT_STATE_ID = 1;
// Sequelize call-site conventions (ORM migration S3, exemplar module):
// - Database.useAsync / transactionAsync hand a handle { models, sequelize, tx };
//   every model call passes { transaction: h.tx } (undefined outside a tx).
// - Reads return plain rows via instance.get({ plain: true }) so the schema
//   decoders keep receiving plain objects with JSON columns parsed.
// - drizzle onConflictDoUpdate -> model.upsert().
/**
 * Convert a Sequelize model instance to a plain object so schema decoders receive parsed JSON columns.
 * @param {Object} row - A Sequelize model instance, or null/undefined.
 * @returns {Object} The plain row object, or undefined when the input is null/undefined.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));
/** Effect service tag for the account repository. */
export class Service extends Context.Service()("@closedcode/AccountRepo") {}
/** Effect Layer that builds the account repository service backed by the shared Database. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const decode = Schema.decodeUnknownSync(Info);
  /**
   * Run a database callback (no explicit transaction) and wrap any failure as an AccountRepoError.
   * @param {Function} f - Callback receiving the database handle and returning a Promise.
   * @returns {Effect} An Effect resolving to the callback result.
   */
  const query = f => Effect.tryPromise({
    try: () => Database.useAsync(f),
    catch: cause => new AccountRepoError({
      message: "Database operation failed",
      cause
    })
  });
  /**
   * Run a database callback inside a transaction and wrap any failure as an AccountRepoError.
   * @param {Function} f - Callback receiving the transactional database handle and returning a Promise.
   * @returns {Effect} An Effect resolving to the callback result.
   */
  const tx = f => Effect.tryPromise({
    try: () => Database.transactionAsync(f),
    catch: cause => new AccountRepoError({
      message: "Database operation failed",
      cause
    })
  });
  /**
   * Look up the currently active account, merging in the active org id from the singleton state row.
   * @param {Object} h - Database handle providing models and the optional transaction.
   * @returns {Promise<Object>} The active account augmented with active_org_id, or undefined when none is selected.
   */
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
  /**
   * Upsert the singleton state row that records the active account and org.
   * @param {Object} h - Database handle providing models and the optional transaction.
   * @param {string} accountID - The account id to mark active.
   * @param {Option} orgID - Option of the active org id; when None, the active org is cleared.
   * @returns {Promise} The Sequelize upsert promise.
   */
  const state = (h, accountID, orgID) => {
    const id = Option.getOrNull(orgID);
    return h.models.AccountState.upsert({
      id: ACCOUNT_STATE_ID,
      active_account_id: accountID,
      active_org_id: id
    }, { transaction: h.tx });
  };
  /**
   * Get the active account.
   * @returns {Effect} An Effect resolving to Option of the decoded active account Info.
   */
  const active = Effect.fn("AccountRepo.active")(() => query(h => current(h)).pipe(Effect.map(row => row ? Option.some(decode(row)) : Option.none())));
  /**
   * List all stored accounts (each with active_org_id forced to null).
   * @returns {Effect} An Effect resolving to an array of decoded account Info records.
   */
  const list = Effect.fn("AccountRepo.list")(() => query(async h => {
    const rows = await h.models.Account.findAll({ transaction: h.tx });
    return rows.map(row => decode({
      ...plain(row),
      active_org_id: null
    }));
  }));
  /**
   * Delete an account and clear the active selection if it pointed at that account.
   * @param {string} accountID - The id of the account to remove.
   * @returns {Effect} An Effect resolving to void.
   */
  const remove = Effect.fn("AccountRepo.remove")(accountID => tx(async h => {
    await h.models.AccountState.update({
      active_account_id: null,
      active_org_id: null
    }, { where: { active_account_id: accountID }, transaction: h.tx });
    await h.models.Account.destroy({ where: { id: accountID }, transaction: h.tx });
  }).pipe(Effect.asVoid));
  /**
   * Set the active account and org.
   * @param {string} accountID - The account id to mark active.
   * @param {Option} orgID - Option of the org id to mark active.
   * @returns {Effect} An Effect resolving to void.
   */
  const use = Effect.fn("AccountRepo.use")((accountID, orgID) => query(h => state(h, accountID, orgID)).pipe(Effect.asVoid));
  /**
   * Fetch a single raw account row by primary key.
   * @param {string} accountID - The account id to look up.
   * @returns {Effect} An Effect resolving to Option of the plain account row.
   */
  const getRow = Effect.fn("AccountRepo.getRow")(accountID => query(async h => plain(await h.models.Account.findByPk(accountID, { transaction: h.tx }))).pipe(Effect.map(Option.fromNullishOr)));
  /**
   * Persist refreshed token fields (access/refresh token and expiry) for an account.
   * @param {Object} input - Token payload: {accountID, accessToken, refreshToken, expiry}; expiry is an Option of timestamp.
   * @returns {Effect} An Effect resolving to void.
   */
  const persistToken = Effect.fn("AccountRepo.persistToken")(input => query(h => h.models.Account.update({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_expiry: Option.getOrNull(input.expiry)
  }, { where: { id: input.accountID }, transaction: h.tx })).pipe(Effect.asVoid));
  /**
   * Upsert a full account record and set it (with its org) as active, in a single transaction.
   * @param {Object} input - Account payload: {id, email, url, accessToken, refreshToken, expiry, orgID}; orgID is an Option.
   * @returns {Effect} An Effect resolving to void.
   */
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
