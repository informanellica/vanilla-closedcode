import { PartID } from "@/session/schema.js";
export function strip(part) {
  const {
    id: _id,
    messageID: _messageID,
    sessionID: _sessionID,
    ...rest
  } = part;
  return rest;
}
export function assign(part) {
  return {
    ...part,
    id: PartID.ascending()
  };
}