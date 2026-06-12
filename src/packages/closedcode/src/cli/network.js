import { Config } from "#config/config.js";
import { AppRuntime } from "#effect/app-runtime.js";
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
export function withNetworkOptions(yargs) {
  return yargs.options(options);
}
export async function resolveNetworkOptions(args) {
  const config = await AppRuntime.runPromise(Config.Service.use(cfg => cfg.getGlobal()));
  return resolveNetworkOptionsNoConfig(args, config);
}
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