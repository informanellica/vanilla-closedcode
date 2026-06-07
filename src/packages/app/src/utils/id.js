import z from "zod";
const prefixes = {
  session: "ses",
  message: "msg",
  permission: "per",
  user: "usr",
  part: "prt",
  pty: "pty"
};
const LENGTH = 26;
let lastTimestamp = 0;
let counter = 0;
export let Identifier;
(function (_Identifier) {
  function schema(prefix) {
    return z.string().startsWith(prefixes[prefix]);
  }
  _Identifier.schema = schema;
  function ascending(prefix, given) {
    return generateID(prefix, false, given);
  }
  _Identifier.ascending = ascending;
  function descending(prefix, given) {
    return generateID(prefix, true, given);
  }
  _Identifier.descending = descending;
})(Identifier || (Identifier = {}));
function generateID(prefix, descending, given) {
  if (!given) {
    return create(prefix, descending);
  }
  if (!given.startsWith(prefixes[prefix])) {
    throw new Error(`ID ${given} does not start with ${prefixes[prefix]}`);
  }
  return given;
}
function create(prefix, descending, timestamp) {
  const currentTimestamp = timestamp ?? Date.now();
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp;
    counter = 0;
  }
  counter += 1;
  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);
  if (descending) {
    now = ~now;
  }
  const timeBytes = new Uint8Array(6);
  for (let i = 0; i < 6; i += 1) {
    timeBytes[i] = Number(now >> BigInt(40 - 8 * i) & BigInt(0xff));
  }
  return prefixes[prefix] + "_" + bytesToHex(timeBytes) + randomBase62(LENGTH - 12);
}
function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
function randomBase62(length) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = getRandomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[bytes[i] % 62];
  }
  return result;
}
function getRandomBytes(length) {
  const bytes = new Uint8Array(length);
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}