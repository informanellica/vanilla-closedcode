import { randomBytes } from "crypto";
export let Identifier;
(function (_Identifier) {
  const LENGTH = 26;

  // State for monotonic ID generation
  let lastTimestamp = 0;
  let counter = 0;
  function ascending() {
    return create(false);
  }
  _Identifier.ascending = ascending;
  function descending() {
    return create(true);
  }
  _Identifier.descending = descending;
  function randomBase62(length) {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let result = "";
    const bytes = randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % 62];
    }
    return result;
  }
  function create(descending, timestamp) {
    const currentTimestamp = timestamp ?? Date.now();
    if (currentTimestamp !== lastTimestamp) {
      lastTimestamp = currentTimestamp;
      counter = 0;
    }
    counter++;
    let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);
    now = descending ? ~now : now;
    const timeBytes = Buffer.alloc(6);
    for (let i = 0; i < 6; i++) {
      timeBytes[i] = Number(now >> BigInt(40 - 8 * i) & BigInt(0xff));
    }
    return timeBytes.toString("hex") + randomBase62(LENGTH - 12);
  }
  _Identifier.create = create;
})(Identifier || (Identifier = {}));