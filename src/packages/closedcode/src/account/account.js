/** @file Account service: device-flow login, token refresh/caching, and remote org/user/config fetching over HTTP. */
import { Cache, Clock, Duration, Effect, Layer, Option, Schema, SchemaGetter, Context } from "effect";
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { withTransientReadRetry } from "#util/effect-http-client.js";
import { AccountRepo } from "./repo.js";
import { normalizeServerUrl } from "./url.js";
import { AccessToken, AccountID, DeviceCode, RefreshToken, AccountServiceError, AccountTransportError, Login, Org, PollDenied, PollError, PollExpired, PollPending, PollSlow, PollSuccess, UserCode } from "./schema.js";
export { AccountID, AccountRepoError, AccountServiceError, AccountTransportError, AccessToken, RefreshToken, DeviceCode, UserCode, Info, Org, OrgID, Login, PollSuccess, PollPending, PollSlow, PollExpired, PollDenied, PollError, PollResult } from "./schema.js";
/** Wire schema for the remote `/api/config` response: a JSON record under `config`. */
class RemoteConfig extends Schema.Class("RemoteConfig")({
  config: Schema.Record(Schema.String, Schema.Json)
}) {}
/** Schema transforming a number of seconds (wire form) to/from an Effect Duration. */
const DurationFromSeconds = Schema.Number.pipe(Schema.decodeTo(Schema.Duration, {
  decode: SchemaGetter.transform(n => Duration.seconds(n)),
  encode: SchemaGetter.transform(d => Duration.toSeconds(d))
}));
/** Wire schema for a token-refresh response (new access/refresh tokens and lifetime). */
class TokenRefresh extends Schema.Class("TokenRefresh")({
  access_token: AccessToken,
  refresh_token: RefreshToken,
  expires_in: DurationFromSeconds
}) {}
/** Wire schema for the device-authorization response (device/user codes, verification URI, expiry, poll interval). */
class DeviceAuth extends Schema.Class("DeviceAuth")({
  device_code: DeviceCode,
  user_code: UserCode,
  verification_uri_complete: Schema.String,
  expires_in: DurationFromSeconds,
  interval: DurationFromSeconds
}) {}
/** Wire schema for a successful device-token exchange (issued tokens and lifetime). */
class DeviceTokenSuccess extends Schema.Class("DeviceTokenSuccess")({
  access_token: AccessToken,
  refresh_token: RefreshToken,
  token_type: Schema.Literal("Bearer"),
  expires_in: DurationFromSeconds
}) {}
/** Wire schema for a device-token error response (OAuth `error` and `error_description`). */
class DeviceTokenError extends Schema.Class("DeviceTokenError")({
  error: Schema.String,
  error_description: Schema.String
}) {
  /**
   * Map this OAuth device-token error code to the corresponding poll result.
   * @returns {Object} A PollPending, PollSlow, PollExpired, PollDenied, or PollError instance.
   */
  toPollResult() {
    if (this.error === "authorization_pending") return new PollPending();
    if (this.error === "slow_down") return new PollSlow();
    if (this.error === "expired_token") return new PollExpired();
    if (this.error === "access_denied") return new PollDenied();
    return new PollError({
      cause: this.error
    });
  }
}
/** Union of the two possible device-token responses (success or error). */
const DeviceToken = Schema.Union([DeviceTokenSuccess, DeviceTokenError]);
/** Wire schema for the `/api/user` response (account id and email). */
class User extends Schema.Class("User")({
  id: AccountID,
  email: Schema.String
}) {}
/** Request body schema carrying the OAuth client id. */
class ClientId extends Schema.Class("ClientId")({
  client_id: Schema.String
}) {}
/** Request body schema for exchanging a device code for tokens. */
class DeviceTokenRequest extends Schema.Class("DeviceTokenRequest")({
  grant_type: Schema.String,
  device_code: DeviceCode,
  client_id: Schema.String
}) {}
/** Request body schema for refreshing tokens with a refresh token. */
class TokenRefreshRequest extends Schema.Class("TokenRefreshRequest")({
  grant_type: Schema.String,
  refresh_token: RefreshToken,
  client_id: Schema.String
}) {}
/** OAuth client identifier sent with device-flow requests. */
const clientId = "opencode-cli";
/** How far before expiry a token is refreshed eagerly. */
const eagerRefreshThreshold = Duration.minutes(5);
/** The eager-refresh threshold expressed in milliseconds. */
const eagerRefreshThresholdMs = Duration.toMillis(eagerRefreshThreshold);
/**
 * Determine whether a token is still fresh, accounting for the eager-refresh margin.
 * @param {number} tokenExpiry - The token expiry timestamp in milliseconds, or null/undefined.
 * @param {number} now - The current time in milliseconds.
 * @returns {boolean} True when the token will not expire within the eager-refresh window.
 */
const isTokenFresh = (tokenExpiry, now) => tokenExpiry != null && tokenExpiry > now + eagerRefreshThresholdMs;
/**
 * Build an Effect combinator that maps any failure into an account-domain error.
 * @param {string} message - Fallback message for non-domain causes.
 * @returns {Function} A function from Effect to Effect that remaps its error channel.
 */
const mapAccountServiceError = (message = "Account service operation failed") => effect => effect.pipe(Effect.mapError(cause => accountErrorFromCause(cause, message)));
/**
 * Normalize an arbitrary failure cause into an AccountServiceError or AccountTransportError.
 * @param {*} cause - The original failure (domain error, HTTP client error, or anything else).
 * @param {string} message - Message to attach when wrapping a non-transport cause.
 * @returns {Object} The appropriate account-domain error.
 */
const accountErrorFromCause = (cause, message) => {
  if (cause instanceof AccountServiceError || cause instanceof AccountTransportError) {
    return cause;
  }
  if (HttpClientError.isHttpClientError(cause)) {
    switch (cause.reason._tag) {
      case "TransportError":
        {
          return AccountTransportError.fromHttpClientError(cause.reason);
        }
      default:
        {
          return new AccountServiceError({
            message,
            cause
          });
        }
    }
  }
  return new AccountServiceError({
    message,
    cause
  });
};
/** Effect service tag for the account service. */
export class Service extends Context.Service()("@closedcode/Account") {}
/** Effect Layer building the account service over the account repo and an HTTP client. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const repo = yield* AccountRepo.Service;
  const http = yield* HttpClient.HttpClient;
  const httpRead = withTransientReadRetry(http);
  const httpOk = HttpClient.filterStatusOk(http);
  const httpReadOk = HttpClient.filterStatusOk(httpRead);
  const executeRead = request => httpRead.execute(request).pipe(mapAccountServiceError("HTTP request failed"));
  const executeReadOk = request => httpReadOk.execute(request).pipe(mapAccountServiceError("HTTP request failed"));
  const executeEffectOk = request => request.pipe(Effect.flatMap(req => httpOk.execute(req)), mapAccountServiceError("HTTP request failed"));
  const executeEffect = request => request.pipe(Effect.flatMap(req => http.execute(req)), mapAccountServiceError("HTTP request failed"));
  /**
   * Exchange the stored refresh token for a fresh access token and persist the new tokens.
   * @param {Object} row - The stored account row (must include url, refresh_token, and id).
   * @returns {Effect} An Effect resolving to the new access token.
   */
  const refreshToken = Effect.fnUntraced(function* (row) {
    const now = yield* Clock.currentTimeMillis;
    const response = yield* executeEffectOk(HttpClientRequest.post(`${row.url}/auth/device/token`).pipe(HttpClientRequest.acceptJson, HttpClientRequest.schemaBodyJson(TokenRefreshRequest)(new TokenRefreshRequest({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId
    }))));
    const parsed = yield* HttpClientResponse.schemaBodyJson(TokenRefresh)(response).pipe(mapAccountServiceError("Failed to decode response"));
    const expiry = Option.some(now + Duration.toMillis(parsed.expires_in));
    yield* repo.persistToken({
      accountID: row.id,
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiry
    });
    return parsed.access_token;
  });
  // Cache keyed by accountID that de-duplicates concurrent token refreshes; re-reads the
  // row on each lookup and only refreshes when the persisted token is no longer fresh.
  const refreshTokenCache = yield* Cache.make({
    capacity: Number.POSITIVE_INFINITY,
    timeToLive: Duration.zero,
    lookup: Effect.fnUntraced(function* (accountID) {
      const maybeAccount = yield* repo.getRow(accountID);
      if (Option.isNone(maybeAccount)) {
        return yield* Effect.fail(new AccountServiceError({
          message: "Account not found during token refresh"
        }));
      }
      const account = maybeAccount.value;
      const now = yield* Clock.currentTimeMillis;
      if (isTokenFresh(account.token_expiry, now)) {
        return account.access_token;
      }
      return yield* refreshToken(account);
    })
  });
  /**
   * Return a valid access token for an account, refreshing through the cache if the stored token is stale.
   * @param {Object} row - The stored account row (must include token_expiry, access_token, and id).
   * @returns {Effect} An Effect resolving to a usable access token.
   */
  const resolveToken = Effect.fnUntraced(function* (row) {
    const now = yield* Clock.currentTimeMillis;
    if (isTokenFresh(row.token_expiry, now)) {
      return row.access_token;
    }
    return yield* Cache.get(refreshTokenCache, row.id);
  });
  /**
   * Load an account and its current access token.
   * @param {string} accountID - The id of the account to resolve.
   * @returns {Effect} An Effect resolving to Option of {account, accessToken}; None when the account is missing.
   */
  const resolveAccess = Effect.fnUntraced(function* (accountID) {
    const maybeAccount = yield* repo.getRow(accountID);
    if (Option.isNone(maybeAccount)) return Option.none();
    const account = maybeAccount.value;
    const accessToken = yield* resolveToken(account);
    return Option.some({
      account,
      accessToken
    });
  });
  /**
   * Fetch the organizations available to a token from the given server.
   * @param {string} url - The account server base URL.
   * @param {string} accessToken - A bearer access token.
   * @returns {Effect} An Effect resolving to an array of Org records.
   */
  const fetchOrgs = Effect.fnUntraced(function* (url, accessToken) {
    const response = yield* executeReadOk(HttpClientRequest.get(`${url}/api/orgs`).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bearerToken(accessToken)));
    return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Org))(response).pipe(mapAccountServiceError("Failed to decode response"));
  });
  /**
   * Fetch the authenticated user (account) from the given server.
   * @param {string} url - The account server base URL.
   * @param {string} accessToken - A bearer access token.
   * @returns {Effect} An Effect resolving to a User record.
   */
  const fetchUser = Effect.fnUntraced(function* (url, accessToken) {
    const response = yield* executeReadOk(HttpClientRequest.get(`${url}/api/user`).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bearerToken(accessToken)));
    return yield* HttpClientResponse.schemaBodyJson(User)(response).pipe(mapAccountServiceError("Failed to decode response"));
  });
  /**
   * Resolve just the access token for an account.
   * @param {string} accountID - The id of the account.
   * @returns {Effect} An Effect resolving to Option of the access token.
   */
  const token = Effect.fn("Account.token")(accountID => resolveAccess(accountID).pipe(Effect.map(Option.map(r => r.accessToken))));
  /**
   * Resolve the active account together with its active organization.
   * @returns {Effect} An Effect resolving to Option of {account, org}; None when no active account/org is set.
   */
  const activeOrg = Effect.fn("Account.activeOrg")(function* () {
    const activeAccount = yield* repo.active();
    if (Option.isNone(activeAccount)) return Option.none();
    const account = activeAccount.value;
    if (!account.active_org_id) return Option.none();
    const accountOrgs = yield* orgs(account.id);
    const org = accountOrgs.find(item => item.id === account.active_org_id);
    if (!org) return Option.none();
    return Option.some({
      account,
      org
    });
  });
  /**
   * Fetch the organizations for every stored account (failures per account yield an empty list).
   * @returns {Effect} An Effect resolving to an array of {account, orgs} entries.
   */
  const orgsByAccount = Effect.fn("Account.orgsByAccount")(function* () {
    const accounts = yield* repo.list();
    return yield* Effect.forEach(accounts, account => orgs(account.id).pipe(Effect.catch(() => Effect.succeed([])), Effect.map(orgs => ({
      account,
      orgs
    }))), {
      concurrency: 3
    });
  });
  /**
   * Fetch the organizations for a single account.
   * @param {string} accountID - The id of the account.
   * @returns {Effect} An Effect resolving to an array of Org records (empty when the account is missing).
   */
  const orgs = Effect.fn("Account.orgs")(function* (accountID) {
    const resolved = yield* resolveAccess(accountID);
    if (Option.isNone(resolved)) return [];
    const {
      account,
      accessToken
    } = resolved.value;
    return yield* fetchOrgs(account.url, accessToken);
  });
  /**
   * Fetch the remote configuration for an account/org from the server.
   * @param {string} accountID - The id of the account.
   * @param {string} orgID - The organization id, sent as the `x-org-id` header.
   * @returns {Effect} An Effect resolving to Option of the config record; None when missing (404) or account absent.
   */
  const config = Effect.fn("Account.config")(function* (accountID, orgID) {
    const resolved = yield* resolveAccess(accountID);
    if (Option.isNone(resolved)) return Option.none();
    const {
      account,
      accessToken
    } = resolved.value;
    const response = yield* executeRead(HttpClientRequest.get(`${account.url}/api/config`).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bearerToken(accessToken), HttpClientRequest.setHeaders({
      "x-org-id": orgID
    })));
    if (response.status === 404) return Option.none();
    const ok = yield* HttpClientResponse.filterStatusOk(response).pipe(mapAccountServiceError());
    const parsed = yield* HttpClientResponse.schemaBodyJson(RemoteConfig)(ok).pipe(mapAccountServiceError("Failed to decode response"));
    return Option.some(parsed.config);
  });
  /**
   * Begin the OAuth device-authorization flow against a server.
   * @param {string} server - The server URL to log in to (normalized before use).
   * @returns {Effect} An Effect resolving to a Login with the device/user codes, verification URL, and timing.
   */
  const login = Effect.fn("Account.login")(function* (server) {
    const normalizedServer = normalizeServerUrl(server);
    const response = yield* executeEffectOk(HttpClientRequest.post(`${normalizedServer}/auth/device/code`).pipe(HttpClientRequest.acceptJson, HttpClientRequest.schemaBodyJson(ClientId)(new ClientId({
      client_id: clientId
    }))));
    const parsed = yield* HttpClientResponse.schemaBodyJson(DeviceAuth)(response).pipe(mapAccountServiceError("Failed to decode response"));
    return new Login({
      code: parsed.device_code,
      user: parsed.user_code,
      url: `${normalizedServer}${parsed.verification_uri_complete}`,
      server: normalizedServer,
      expiry: parsed.expires_in,
      interval: parsed.interval
    });
  });
  /**
   * Poll the device-token endpoint once; on success, persist the account, tokens, and first org.
   * @param {Object} input - Poll input carrying {server, code} from the prior Login.
   * @returns {Effect} An Effect resolving to a PollResult (success, pending, slow, expired, denied, or error).
   */
  const poll = Effect.fn("Account.poll")(function* (input) {
    const response = yield* executeEffect(HttpClientRequest.post(`${input.server}/auth/device/token`).pipe(HttpClientRequest.acceptJson, HttpClientRequest.schemaBodyJson(DeviceTokenRequest)(new DeviceTokenRequest({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: input.code,
      client_id: clientId
    }))));
    const parsed = yield* HttpClientResponse.schemaBodyJson(DeviceToken)(response).pipe(mapAccountServiceError("Failed to decode response"));
    if (parsed instanceof DeviceTokenError) return parsed.toPollResult();
    const accessToken = parsed.access_token;
    const user = fetchUser(input.server, accessToken);
    const orgs = fetchOrgs(input.server, accessToken);
    const [account, remoteOrgs] = yield* Effect.all([user, orgs], {
      concurrency: 2
    });

    // TODO: When there are multiple orgs, let the user choose
    const firstOrgID = remoteOrgs.length > 0 ? Option.some(remoteOrgs[0].id) : Option.none();
    const now = yield* Clock.currentTimeMillis;
    const expiry = now + Duration.toMillis(parsed.expires_in);
    const refreshToken = parsed.refresh_token;
    yield* repo.persistAccount({
      id: account.id,
      email: account.email,
      url: input.server,
      accessToken,
      refreshToken,
      expiry,
      orgID: firstOrgID
    });
    return new PollSuccess({
      email: account.email
    });
  });
  return Service.of({
    active: repo.active,
    activeOrg,
    list: repo.list,
    orgsByAccount,
    remove: repo.remove,
    use: repo.use,
    orgs,
    config,
    token,
    login,
    poll
  });
}));
/** Account service layer wired with its default dependencies (repo and fetch-based HTTP client). */
export const defaultLayer = layer.pipe(Layer.provide(AccountRepo.layer), Layer.provide(FetchHttpClient.layer));
export * as Account from "./account.js";