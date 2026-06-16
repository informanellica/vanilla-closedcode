/**
 * @file v2 SDK data builders. Helpers for constructing message payloads in the
 * shape the server expects (info envelope plus parts linked back to the message).
 * @module sdk/v2/data
 */

/**
 * Builders for message objects.
 * @namespace message
 */
export const message = {
  /**
   * Build a user message from input, splitting it into an info envelope and a list
   * of parts that reference the message and session ids.
   * @param {Object} input - Message input including `parts` and the remaining info fields (e.g. `sessionID`).
   * @param {Array<Object>} input.parts - The message parts to attach.
   * @returns {{info: Object, parts: Array<Object>}} The assembled message info and parts.
   */
  user(input) {
    const {
      parts: _parts,
      ...rest
    } = input;
    const info = {
      ...rest,
      id: "asdasd",
      time: {
        created: Date.now()
      },
      role: "user"
    };
    return {
      info,
      parts: input.parts.map(part => ({
        ...part,
        id: "asdasd",
        messageID: info.id,
        sessionID: info.sessionID
      }))
    };
  }
};