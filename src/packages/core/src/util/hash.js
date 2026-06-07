import { createHash } from "crypto";
export let Hash;
(function (_Hash) {
  function fast(input) {
    return createHash("sha1").update(input).digest("hex");
  }
  _Hash.fast = fast;
})(Hash || (Hash = {}));