import { ConfigService } from "#effect/config-service.js";
import { Config, Effect, Encoding, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiError, HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
const AUTH_TOKEN_QUERY = "auth_token";
const UNAUTHORIZED = 401;
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
export class ServerAuthConfig extends ConfigService.Service()("@closedcode/ExperimentalHttpApiServerAuthConfig", {
  password: Config.string("CLOSEDCODE_SERVER_PASSWORD").pipe(Config.option),
  username: Config.string("CLOSEDCODE_SERVER_USERNAME").pipe(Config.withDefault("closedcode"))
}) {}
function validateCredential(effect, credential, config) {
  return Effect.gen(function* () {
    if (!isAuthRequired(config)) return yield* effect;
    if (!isCredentialAuthorized(credential, config)) return yield* new HttpApiError.Unauthorized({});
    return yield* effect;
  });
}
function isAuthRequired(config) {
  return Option.isSome(config.password) && config.password.value !== "";
}
function isCredentialAuthorized(credential, config) {
  return Option.isSome(config.password) && credential.username === config.username && Redacted.value(credential.password) === config.password.value;
}
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
function validateRawCredential(effect, credential, config) {
  if (!isAuthRequired(config)) return effect;
  if (!isCredentialAuthorized(credential, config)) return Effect.succeed(HttpServerResponse.empty({
    status: UNAUTHORIZED
  }));
  return effect;
}
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