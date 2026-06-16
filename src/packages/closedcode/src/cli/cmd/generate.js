/** @file CLI `generate` command: produces the OpenAPI spec (with JS code samples) and prints it as prettier-formatted JSON. */
import { Server } from "../../server/server.js";
import { PublicApi } from "../../server/routes/instance/httpapi/public.js";
import { OpenApi } from "effect/unstable/httpapi";
/**
 * `generate` command definition: builds the OpenAPI spec, injects `x-codeSamples` SDK snippets per operation,
 * formats the JSON through prettier, and writes it to stdout. Supports `--httpapi` to use the Effect HttpApi contract.
 */
export const GenerateCommand = {
  command: "generate",
  builder: yargs => yargs.option("httpapi", {
    type: "boolean",
    default: false,
    description: "Generate OpenAPI from the experimental Effect HttpApi contract"
  }),
  handler: async args => {
    const specs = args.httpapi ? OpenApi.fromApi(PublicApi) : await Server.openapi();
    for (const item of Object.values(specs.paths)) {
      for (const method of ["get", "post", "put", "delete", "patch"]) {
        const operation = item[method];
        if (!operation?.operationId) continue;
        operation["x-codeSamples"] = [{
          lang: "js",
          source: [`import { createClosedcodeClient } from "sdk`, ``, `const client = createClosedcodeClient()`, `await client.${operation.operationId}({`, `  ...`, `})`].join("\n")
        }];
      }
    }
    const raw = JSON.stringify(specs, null, 2);

    // Format through prettier so output is byte-identical to committed file
    // regardless of whether ./script/format.ts runs afterward.
    const prettier = await import("prettier");
    const babel = await import("prettier/plugins/babel");
    const estree = await import("prettier/plugins/estree");
    const format = prettier.format ?? prettier.default?.format;
    const json = await format(raw, {
      parser: "json",
      plugins: [babel.default ?? babel, estree.default ?? estree],
      printWidth: 120
    });

    // Wait for stdout to finish writing before process.exit() is called
    await new Promise((resolve, reject) => {
      process.stdout.write(json, err => {
        if (err) reject(err);else resolve();
      });
    });
  }
};