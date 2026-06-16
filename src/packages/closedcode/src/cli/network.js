/** @file CLI network options (port/hostname/mDNS/CORS) and resolution against global config. */
import { Config } from "#config/config.js";
import { AppRuntime } from "#effect/app-runtime.js";
/**
 * yargs option definitions for the shared network flags.
 * @type {Object}
 */
const options = {
  port: {
    type: "number",
    describe: "port to listen on",
    default: 0
  },
  hostname: {
    type: "string",
    describe: "hostname to listen on",
    default: "127.0.0.1"
  },
  mdns: {
    type: "boolean",
    describe: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    default: false
  },
  "mdns-domain": {
    type: "string",
    describe: "custom domain name for mDNS service (default: closedcode.local)",
    default: "closedcode.local"
  },
  cors: {
    type: "string",
    array: true,
    describe: "additional domains to allow for CORS",
    default: []
  }
};
/**
 * Register the shared network options (port, hostname, mdns, mdns-domain, cors) on a yargs builder.
 * @param {Object} yargs - The yargs command builder.
 * @returns {Object} The same builder with the network options applied.
 */
export function withNetworkOptions(yargs) {
  return yargs.options(options);
}
/**
 * Resolve effective network options by loading the global config and merging it with parsed args.
 * @param {Object} args - Parsed CLI arguments from yargs.
 * @returns {Promise<{hostname: string, port: number, mdns: boolean, mdnsDomain: string, cors: Array<string>}>} The resolved network options.
 */
export async function resolveNetworkOptions(args) {
  const config = await AppRuntime.runPromise(Config.Service.use(cfg => cfg.getGlobal()));
  return resolveNetworkOptionsNoConfig(args, config);
}
/**
 * Merge parsed CLI args with config to produce effective network options. CLI flags that were
 * explicitly passed on the command line win over config; otherwise config wins over the arg
 * defaults. Enabling mDNS without an explicit hostname defaults the hostname to 0.0.0.0, and
 * CORS entries from config and args are concatenated.
 * @param {Object} args - Parsed CLI arguments from yargs.
 * @param {Object} config - The resolved global config (may be undefined).
 * @returns {{hostname: string, port: number, mdns: boolean, mdnsDomain: string, cors: Array<string>}} The resolved network options.
 */
export function resolveNetworkOptionsNoConfig(args, config) {
  const portExplicitlySet = process.argv.includes("--port");
  const hostnameExplicitlySet = process.argv.includes("--hostname");
  const mdnsExplicitlySet = process.argv.includes("--mdns");
  const mdnsDomainExplicitlySet = process.argv.includes("--mdns-domain");
  const mdns = mdnsExplicitlySet ? args.mdns : config?.server?.mdns ?? args.mdns;
  const mdnsDomain = mdnsDomainExplicitlySet ? args["mdns-domain"] : config?.server?.mdnsDomain ?? args["mdns-domain"];
  const port = portExplicitlySet ? args.port : config?.server?.port ?? args.port;
  const hostname = hostnameExplicitlySet ? args.hostname : mdns && !config?.server?.hostname ? "0.0.0.0" : config?.server?.hostname ?? args.hostname;
  const configCors = config?.server?.cors ?? [];
  const argsCors = Array.isArray(args.cors) ? args.cors : args.cors ? [args.cors] : [];
  const cors = [...configCors, ...argsCors];
  return {
    hostname,
    port,
    mdns,
    mdnsDomain,
    cors
  };
}