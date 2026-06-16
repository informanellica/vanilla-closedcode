/** @file HTTP API authorization middleware: optional HTTP Basic / auth-token credential validation against the configured server username and password. */
import { ConfigService } from "#effect/config-service.js";
import { Config, Effect, Encoding, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiError, HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
const AUTH_TOKEN_QUERY = "auth_token";
const UNAUTHORIZED = 401;
/** HttpApi middleware service declaring the supported security schemes (HTTP Basic and an `auth_token` query API key). */
export class Authorization extends HttpApiMiddleware.Service()("@closedcode/ExperimentalHttpApiAuthorization", {
  error: HttpApiError.UnauthorizedNoContent,
  security: {
    basic: HttpApiSecurity.basic,
    authToken: HttpApiSecurity.apiKey({
      in: "query",
      key: AUTH_TOKEN_QUERY
    })
  }
}) {}
/** Config service holding the optional server `password` and the `username` (default `"closedcode"`) used to validate credentials. */
export class ServerAuthConfig extends ConfigService.Service()("@closedcode/ExperimentalHttpApiServerAuthConfig", {
  password: Config.string("CLOSEDCODE_SERVER_PASSWORD").pipe(Config.option),
  username: Config.string("CLOSEDCODE_SERVER_USERNAME").pipe(Config.withDefault("closedcode"))
}) {}
/**
 * Run `effect` only if auth is not required or the credential is authorized; otherwise fail with an `Unauthorized` HttpApi error.
 * @param {Effect} effect - The protected handler effect to run on success.
 * @param {{username: string, password: *}} credential - The decoded credential (password is a Redacted value).
 * @param {Object} config - The server auth config (`username`, `password`).
 * @returns {Effect} An effect that runs `effect` or fails with `HttpApiError.Unauthorized`.
 */
function validateCredential(effect, credential, config) {
  return Effect.gen(function* () {
    if (!isAuthRequired(config)) return yield* effect;
    if (!isCredentialAuthorized(credential, config)) return yield* new HttpApiError.Unauthorized({});
    return yield* effect;
  });
}
/**
 * Determine whether authorization is enabled, i.e. a non-empty password is configured.
 * @param {Object} config - The server auth config.
 * @returns {boolean} True when a non-empty password is set.
 */
function isAuthRequired(config) {
  return Option.isSome(config.password) && config.password.value !== "";
}
/**
 * Check whether a credential matches the configured username and password.
 * @param {{username: string, password: *}} credential - The decoded credential (password is a Redacted value).
 * @param {Object} config - The server auth config.
 * @returns {boolean} True when the username and (revealed) password both match the configuration.
 */
function isCredentialAuthorized(credential, config) {
  return Option.isSome(config.password) && credential.username === config.username && Redacted.value(credential.password) === config.password.value;
}
/**
 * Decode a Base64-encoded `username:password` string into a credential, falling back to empty values on failure.
 * @param {string} input - The Base64-encoded `username:password` string.
 * @returns {Effect} An effect resolving to `{username, password}` with a Redacted password.
 */
function decodeCredential(input) {
  const emptyCredential = {
    username: "",
    password: Redacted.make("")
  };
  return Encoding.decodeBase64String(input).asEffect().pipe(Effect.match({
    onFailure: () => emptyCredential,
    onSuccess: header => {
      const parts = header.split(":");
      if (parts.length !== 2) return emptyCredential;
      return {
        username: parts[0],
        password: Redacted.make(parts[1])
      };
    }
  }));
}
/**
 * Router-level credential check: pass through `effect` when auth is not required or the credential is authorized,
 * otherwise short-circuit with an empty 401 response.
 * @param {Effect} effect - The protected handler effect to run on success.
 * @param {{username: string, password: *}} credential - The decoded credential (password is a Redacted value).
 * @param {Object} config - The server auth config.
 * @returns {Effect} Either `effect` or an effect succeeding with an empty 401 response.
 */
function validateRawCredential(effect, credential, config) {
  if (!isAuthRequired(config)) return effect;
  if (!isCredentialAuthorized(credential, config)) return Effect.succeed(HttpServerResponse.empty({
    status: UNAUTHORIZED
  }));
  return effect;
}
/**
 * Router middleware that enforces authorization for raw (non-HttpApi) routes.
 * When auth is required, it reads the credential from the `Authorization: Basic` header or the
 * `auth_token` query parameter (or an empty credential as a last resort) and validates it before
 * delegating to the wrapped effect.
 */
export const authorizationRouterMiddleware = HttpRouter.middleware()(Effect.gen(function* () {
  const config = yield* ServerAuthConfig;
  if (!isAuthRequired(config)) return effect => effect;
  return effect => Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "");
    if (match) {
      return yield* decodeCredential(match[1]).pipe(Effect.flatMap(credential => validateRawCredential(effect, credential, config)));
    }
    const token = new URL(request.url, "http://localhost").searchParams.get(AUTH_TOKEN_QUERY);
    if (token) {
      return yield* decodeCredential(token).pipe(Effect.flatMap(credential => validateRawCredential(effect, credential, config)));
    }
    return yield* validateRawCredential(effect, {
      username: "",
      password: Redacted.make("")
    }, config);
  });
}));
/**
 * Layer implementing the `Authorization` HttpApi middleware service.
 * Wires the `basic` and `authToken` security schemes to credential validation against `ServerAuthConfig`.
 */
export const authorizationLayer = Layer.effect(Authorization, Effect.gen(function* () {
  const config = yield* ServerAuthConfig;
  return Authorization.of({
    basic: (effect, {
      credential
    }) => validateCredential(effect, credential, config),
    authToken: (effect, {
      credential
    }) => decodeCredential(Redacted.value(credential)).pipe(Effect.flatMap(decoded => validateCredential(effect, decoded, config)))
  });
}));