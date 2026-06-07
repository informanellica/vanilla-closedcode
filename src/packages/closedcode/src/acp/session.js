import { RequestError } from "@agentclientprotocol/sdk";
import * as Log from "core/util/log";
const log = Log.create({
  service: "acp-session-manager"
});
export class ACPSessionManager {
  sessions = new Map();
  constructor(sdk) {
    this.sdk = sdk;
  }
  tryGet(sessionId) {
    return this.sessions.get(sessionId);
  }
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
  getModel(sessionId) {
    const session = this.get(sessionId);
    return session.model;
  }
  setModel(sessionId, model) {
    const session = this.get(sessionId);
    session.model = model;
    this.sessions.set(sessionId, session);
    return session;
  }
  getVariant(sessionId) {
    const session = this.get(sessionId);
    return session.variant;
  }
  setVariant(sessionId, variant) {
    const session = this.get(sessionId);
    session.variant = variant;
    this.sessions.set(sessionId, session);
    return session;
  }
  setMode(sessionId, modeId) {
    const session = this.get(sessionId);
    session.modeId = modeId;
    this.sessions.set(sessionId, session);
    return session;
  }
}