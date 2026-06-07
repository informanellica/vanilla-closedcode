import { Config, Context, Effect, Layer } from "effect";

/**
 * The service shape inferred from an object of Effect `Config` definitions.
 */

/**
 * A Context service class with generated layers for config-backed services.
 */

/**
 * Create a Context service whose implementation is derived from Effect `Config`.
 *
 * This keeps Effect `Config` as the source of truth for env names, defaults, and
 * validation while generating a typed service plus convenient production/test
 * layers.
 *
 * ```ts
 * class ServerAuthConfig extends ConfigService.Service<ServerAuthConfig>()(
 *   "@closedcode/ServerAuthConfig",
 *   {
 *     password: Config.string("CLOSEDCODE_SERVER_PASSWORD").pipe(Config.option),
 *     username: Config.string("CLOSEDCODE_SERVER_USERNAME").pipe(Config.withDefault("closedcode")),
 *   },
 * ) {}
 *
 * const live = ServerAuthConfig.defaultLayer
 * const test = ServerAuthConfig.layer({ password: Option.some("secret"), username: "kit" })
 * ```
 */
export const Service = () => (id, fields) => {
  class ConfigTag extends Context.Service()(id) {
    static layer(input) {
      return Layer.succeed(this, this.of(input));
    }
    static get defaultLayer() {
      return Layer.effect(this, Config.all(fields).asEffect().pipe(
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Config.all preserves the field shape, but its conditional return type also supports iterable inputs.
      Effect.map(config => this.of(config))));
    }
  }

  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- The generated class carries typed static helpers.
  return ConfigTag;
};
export * as ConfigService from "./config-service.js";
