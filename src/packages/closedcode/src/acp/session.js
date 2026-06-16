/** @file ACP session manager: tracks per-session state (cwd, mcp servers, model/variant/mode) for the ACP agent. */
import { RequestError } from "@agentclientprotocol/sdk";
import * as Log from "core/util/log";
const log = Log.create({
  service: "acp-session-manager"
});
/** In-memory registry of ACP session state, backed by the underlying closedcode SDK. */
export class ACPSessionManager {
  sessions = new Map();
  /**
   * @param {Object} sdk - The closedcode SDK used to create/load underlying sessions.
   */
  constructor(sdk) {
    this.sdk = sdk;
  }
  /**
   * Look up session state without throwing.
   * @param {string} sessionId - The session id.
   * @returns {Object} The session state, or undefined when unknown.
   */
  tryGet(sessionId) {
    return this.sessions.get(sessionId);
  }
  /**
   * Create a new underlying session and register its ACP state.
   * @param {string} cwd - The working directory for the session.
   * @param {Array} mcpServers - The MCP server configs associated with the session.
   * @param {Object} model - The model selection for the session.
   * @returns {Promise<Object>} The newly registered session state.
   */
  async create(cwd, mcpServers, model) {
    const session = await this.sdk.session.create({
      directory: cwd
    }, {
      throwOnError: true
    }).then(x => x.data);
    const sessionId = session.id;
    const resolvedModel = model;
    const state = {
      id: sessionId,
      cwd,
      mcpServers,
      createdAt: new Date(),
      model: resolvedModel
    };
    log.info("creating_session", {
      state
    });
    this.sessions.set(sessionId, state);
    return state;
  }
  /**
   * Load an existing underlying session and register its ACP state.
   * @param {string} sessionId - The id of the session to load.
   * @param {string} cwd - The working directory for the session.
   * @param {Array} mcpServers - The MCP server configs associated with the session.
   * @param {Object} model - The model selection for the session.
   * @returns {Promise<Object>} The registered session state.
   */
  async load(sessionId, cwd, mcpServers, model) {
    const session = await this.sdk.session.get({
      sessionID: sessionId,
      directory: cwd
    }, {
      throwOnError: true
    }).then(x => x.data);
    const resolvedModel = model;
    const state = {
      id: sessionId,
      cwd,
      mcpServers,
      createdAt: new Date(session.time.created),
      model: resolvedModel
    };
    log.info("loading_session", {
      state
    });
    this.sessions.set(sessionId, state);
    return state;
  }
  /**
   * Get session state, throwing an ACP invalid-params error when the session is unknown.
   * @param {string} sessionId - The session id.
   * @returns {Object} The session state.
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.error("session not found", {
        sessionId
      });
      throw RequestError.invalidParams(JSON.stringify({
        error: `Session not found: ${sessionId}`
      }));
    }
    return session;
  }
  /**
   * Get the model selection for a session.
   * @param {string} sessionId - The session id.
   * @returns {Object} The session's model selection.
   */
  getModel(sessionId) {
    const session = this.get(sessionId);
    return session.model;
  }
  /**
   * Set the model selection for a session.
   * @param {string} sessionId - The session id.
   * @param {Object} model - The new model selection.
   * @returns {Object} The updated session state.
   */
  setModel(sessionId, model) {
    const session = this.get(sessionId);
    session.model = model;
    this.sessions.set(sessionId, session);
    return session;
  }
  /**
   * Get the model variant for a session.
   * @param {string} sessionId - The session id.
   * @returns {string} The session's variant, or undefined when none is set.
   */
  getVariant(sessionId) {
    const session = this.get(sessionId);
    return session.variant;
  }
  /**
   * Set the model variant for a session.
   * @param {string} sessionId - The session id.
   * @param {string} variant - The variant to set (or undefined to clear).
   * @returns {Object} The updated session state.
   */
  setVariant(sessionId, variant) {
    const session = this.get(sessionId);
    session.variant = variant;
    this.sessions.set(sessionId, session);
    return session;
  }
  /**
   * Set the active mode (agent) for a session.
   * @param {string} sessionId - The session id.
   * @param {string} modeId - The mode/agent id to set.
   * @returns {Object} The updated session state.
   */
  setMode(sessionId, modeId) {
    const session = this.get(sessionId);
    session.modeId = modeId;
    this.sessions.set(sessionId, session);
    return session;
  }
}