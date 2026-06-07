import { AwsClient } from "aws4fetch";
import { lazy } from "core/util/lazy";
export let Storage;
(function (_Storage) {
  function createAdapter(client, endpoint, bucket) {
    const base = `${endpoint}/${bucket}`;
    return {
      async read(path) {
        const response = await client.fetch(`${base}/${path}`);
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`Failed to read ${path}: ${response.status}`);
        return response.text();
      },
      async write(path, value) {
        const response = await client.fetch(`${base}/${path}`, {
          method: "PUT",
          body: value,
          headers: {
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) throw new Error(`Failed to write ${path}: ${response.status}`);
      },
      async remove(path) {
        const response = await client.fetch(`${base}/${path}`, {
          method: "DELETE"
        });
        if (!response.ok) throw new Error(`Failed to remove ${path}: ${response.status}`);
      },
      async list(options) {
        const prefix = options?.prefix || "";
        const params = new URLSearchParams({
          "list-type": "2",
          prefix
        });
        if (options?.limit) params.set("max-keys", options.limit.toString());
        if (options?.after) {
          const afterPath = prefix + options.after + ".json";
          params.set("start-after", afterPath);
        }
        const response = await client.fetch(`${base}?${params}`);
        if (!response.ok) throw new Error(`Failed to list ${prefix}: ${response.status}`);
        const xml = await response.text();
        const keys = [];
        const regex = /<Key>([^<]+)<\/Key>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
          keys.push(match[1]);
        }
        if (options?.before) {
          const beforePath = prefix + options.before + ".json";
          return keys.filter(key => key < beforePath);
        }
        return keys;
      }
    };
  }
  function s3() {
    const bucket = process.env.CLOSEDCODE_STORAGE_BUCKET;
    const region = process.env.CLOSEDCODE_STORAGE_REGION || "us-east-1";
    const client = new AwsClient({
      region,
      accessKeyId: process.env.CLOSEDCODE_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOSEDCODE_STORAGE_SECRET_ACCESS_KEY
    });
    return createAdapter(client, `https://s3.${region}.amazonaws.com`, bucket);
  }
  function r2() {
    const accountId = process.env.CLOSEDCODE_STORAGE_ACCOUNT_ID;
    const client = new AwsClient({
      accessKeyId: process.env.CLOSEDCODE_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOSEDCODE_STORAGE_SECRET_ACCESS_KEY
    });
    return createAdapter(client, `https://${accountId}.r2.cloudflarestorage.com`, process.env.CLOSEDCODE_STORAGE_BUCKET);
  }
  const adapter = lazy(() => {
    const type = process.env.CLOSEDCODE_STORAGE_ADAPTER;
    if (type === "r2") return r2();
    if (type === "s3") return s3();
    throw new Error("No storage adapter configured");
  });
  function resolve(key) {
    return key.join("/") + ".json";
  }
  async function read(key) {
    const result = await adapter().read(resolve(key));
    if (!result) return undefined;
    return JSON.parse(result);
  }
  _Storage.read = read;
  function write(key, value) {
    return adapter().write(resolve(key), JSON.stringify(value));
  }
  _Storage.write = write;
  function remove(key) {
    return adapter().remove(resolve(key));
  }
  _Storage.remove = remove;
  async function list(options) {
    const p = options?.prefix ? options.prefix.join("/") + (options.prefix.length ? "/" : "") : "";
    const result = await adapter().list({
      prefix: p,
      limit: options?.limit,
      after: options?.after,
      before: options?.before
    });
    return result.map(x => x.replace(/\.json$/, "").split("/"));
  }
  _Storage.list = list;
  async function update(key, fn) {
    const val = await read(key);
    if (!val) throw new Error("Not found");
    fn(val);
    await write(key, val);
    return val;
  }
  _Storage.update = update;
})(Storage || (Storage = {}));