/** @file Cloudflare Worker API: a SyncServer Durable Object for session sharing plus a Hono router for share, Feishu relay, and GitHub app token exchange endpoints. */
import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import { randomUUID } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Resource } from "sst";
/**
 * Durable Object that fans out shared session state to subscribed WebSocket clients
 * and persists session messages to a bucket and durable storage.
 */
export class SyncServer extends DurableObject {
  /**
   * Constructs the Durable Object.
   * @param {Object} ctx - The Durable Object state/context.
   * @param {Object} env - The Worker environment bindings.
   */
  // oxlint-disable-next-line no-useless-constructor
  constructor(ctx, env) {
    super(ctx, env);
  }
  /**
   * Handles a subscribe request by accepting a WebSocket and replaying existing session state.
   * @returns {Promise<Response>} A 101 Switching Protocols response carrying the client WebSocket.
   */
  async fetch() {
    console.log("SyncServer subscribe");
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    const data = await this.ctx.storage.list();
    Array.from(data.entries()).filter(([key, _]) => key.startsWith("session/")).map(([key, content]) => server.send(JSON.stringify({
      key,
      content
    })));
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
  /**
   * Handles inbound WebSocket messages from subscribers. No-op; subscribers are read-only.
   * @param {Object} _ws - The WebSocket that received the message.
   * @param {*} _message - The received message payload.
   */
  async webSocketMessage(_ws, _message) {}
  /**
   * Handles a WebSocket close event by closing the server-side socket with the given code.
   * @param {Object} ws - The WebSocket being closed.
   * @param {number} code - The close status code.
   * @param {string} _reason - The close reason (unused).
   * @param {boolean} _wasClean - Whether the connection closed cleanly (unused).
   */
  async webSocketClose(ws, code, _reason, _wasClean) {
    ws.close(code, "Durable Object is closing WebSocket");
  }
  /**
   * Validates and stores a session entry, then broadcasts it to all subscribed clients.
   * @param {string} key - The storage key; must belong to this session's info, message, or part namespace.
   * @param {*} content - The entry content to persist and broadcast.
   * @returns {Promise<Response>} A 400 Response if the key is invalid; otherwise resolves with no value.
   */
  async publish(key, content) {
    const sessionID = await this.getSessionID();
    if (!key.startsWith(`session/info/${sessionID}`) && !key.startsWith(`session/message/${sessionID}/`) && !key.startsWith(`session/part/${sessionID}/`)) return new Response("Error: Invalid key", {
      status: 400
    });

    // store message
    await this.env.Bucket.put(`share/${key}.json`, JSON.stringify(content), {
      httpMetadata: {
        contentType: "application/json"
      }
    });
    await this.ctx.storage.put(key, content);
    const clients = this.ctx.getWebSockets();
    console.log("SyncServer publish", key, "to", clients.length, "subscribers");
    for (const client of clients) {
      client.send(JSON.stringify({
        key,
        content
      }));
    }
  }
  /**
   * Returns the share secret for the session, creating and persisting one (with the session id) on first use.
   * @param {string} sessionID - The session id to associate with the share secret.
   * @returns {Promise<string>} The existing or newly created share secret.
   */
  async share(sessionID) {
    let secret = await this.getSecret();
    if (secret) return secret;
    secret = randomUUID();
    await this.ctx.storage.put("secret", secret);
    await this.ctx.storage.put("sessionID", sessionID);
    return secret;
  }
  /**
   * Returns all stored session entries as an array of key/content pairs.
   * @returns {Promise<Array>} The session entries currently held in durable storage.
   */
  async getData() {
    const data = await this.ctx.storage.list();
    return Array.from(data.entries()).filter(([key, _]) => key.startsWith("session/")).map(([key, content]) => ({
      key,
      content
    }));
  }
  /**
   * Throws if the provided secret does not match the stored share secret.
   * @param {string} secret - The secret to verify.
   * @returns {Promise<void>} Resolves when the secret matches; otherwise throws.
   */
  async assertSecret(secret) {
    if (secret !== (await this.getSecret())) throw new Error("Invalid secret");
  }
  /**
   * Returns the stored share secret.
   * @returns {Promise<string>} The share secret, or undefined if none has been set.
   */
  async getSecret() {
    return this.ctx.storage.get("secret");
  }
  /**
   * Returns the stored session id.
   * @returns {Promise<string>} The session id, or undefined if none has been set.
   */
  async getSessionID() {
    return this.ctx.storage.get("sessionID");
  }
  /**
   * Deletes all bucket objects and durable storage entries for this session.
   * @returns {Promise<void>} Resolves once all session data is removed.
   */
  async clear() {
    const sessionID = await this.getSessionID();
    const list = await this.env.Bucket.list({
      prefix: `session/message/${sessionID}/`,
      limit: 1000
    });
    for (const item of list.objects) {
      await this.env.Bucket.delete(item.key);
    }
    await this.env.Bucket.delete(`session/info/${sessionID}`);
    await this.ctx.storage.deleteAll();
  }
  /**
   * Derives the short Durable Object name from a session id (its last 8 characters).
   * @param {string} id - The full session id.
   * @returns {string} The trailing 8-character short name.
   */
  static shortName(id) {
    return id.substring(id.length - 8);
  }
}
/**
 * The Hono application exported as the Worker fetch handler.
 * Routes: GET "/" health check; POST "/share_create" to start sharing a session and get a secret/URL;
 * POST "/share_delete" and "/share_delete_admin" to tear down a share; POST "/share_sync" to publish an entry;
 * GET "/share_poll" to subscribe over WebSocket; GET "/share_data" to fetch aggregated session info and messages;
 * POST "/feishu" to relay Feishu messages to Discord; the GitHub token-exchange endpoints below; and a catch-all 404.
 */
export default new Hono().get("/", c => c.text("Hello, world!")).post("/share_create", async c => {
  const body = await c.req.json();
  const sessionID = body.sessionID;
  const short = SyncServer.shortName(sessionID);
  const id = c.env.SYNC_SERVER.idFromName(short);
  const stub = c.env.SYNC_SERVER.get(id);
  const secret = await stub.share(sessionID);
  return c.json({
    secret,
    url: `https://${c.env.WEB_DOMAIN}/s/${short}`
  });
}).post("/share_delete", async c => {
  const body = await c.req.json();
  const sessionID = body.sessionID;
  const secret = body.secret;
  const id = c.env.SYNC_SERVER.idFromName(SyncServer.shortName(sessionID));
  const stub = c.env.SYNC_SERVER.get(id);
  await stub.assertSecret(secret);
  await stub.clear();
  return c.json({});
}).post("/share_delete_admin", async c => {
  const body = await c.req.json();
  const sessionShortName = body.sessionShortName;
  const adminSecret = body.adminSecret;
  if (adminSecret !== Resource.ADMIN_SECRET.value) throw new Error("Invalid admin secret");
  const id = c.env.SYNC_SERVER.idFromName(sessionShortName);
  const stub = c.env.SYNC_SERVER.get(id);
  await stub.clear();
  return c.json({});
}).post("/share_sync", async c => {
  const body = await c.req.json();
  const name = SyncServer.shortName(body.sessionID);
  const id = c.env.SYNC_SERVER.idFromName(name);
  const stub = c.env.SYNC_SERVER.get(id);
  await stub.assertSecret(body.secret);
  await stub.publish(body.key, body.content);
  return c.json({});
}).get("/share_poll", async c => {
  const upgradeHeader = c.req.header("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return c.text("Error: Upgrade header is required", {
      status: 426
    });
  }
  const id = c.req.query("id");
  console.log("share_poll", id);
  if (!id) return c.text("Error: Share ID is required", {
    status: 400
  });
  const stub = c.env.SYNC_SERVER.get(c.env.SYNC_SERVER.idFromName(id));
  return stub.fetch(c.req.raw);
}).get("/share_data", async c => {
  const id = c.req.query("id");
  console.log("share_data", id);
  if (!id) return c.text("Error: Share ID is required", {
    status: 400
  });
  const stub = c.env.SYNC_SERVER.get(c.env.SYNC_SERVER.idFromName(id));
  const data = await stub.getData();
  let info;
  const messages = {};
  data.forEach(d => {
    const [root, type] = d.key.split("/");
    if (root !== "session") return;
    if (type === "info") {
      info = d.content;
      return;
    }
    if (type === "message") {
      messages[d.content.id] = {
        parts: [],
        ...d.content
      };
    }
    if (type === "part") {
      messages[d.content.messageID].parts.push(d.content);
    }
  });
  return c.json({
    info,
    messages
  });
}).post("/feishu", async c => {
  const body = await c.req.json();
  console.log(JSON.stringify(body, null, 2));
  const challenge = body.challenge;
  if (challenge) return c.json({
    challenge
  });
  const content = body.event?.message?.content;
  const parsed = typeof content === "string" && content.trim().startsWith("{") ? JSON.parse(content) : undefined;
  const text = typeof parsed?.text === "string" ? parsed.text : typeof content === "string" ? content : "";
  let message = text.trim().replace(/^@_user_\d+\s*/, "");
  message = message.replace(/^aiden,?\s*/i, "<@759257817772851260> ");
  if (!message) return c.json({
    ok: true
  });
  const threadId = body.event?.message?.root_id || body.event?.message?.message_id;
  if (threadId) message = `${message} [${threadId}]`;
  const response = await fetch(`https://discord.com/api/v10/channels/${Resource.DISCORD_SUPPORT_CHANNEL_ID.value}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${Resource.DISCORD_SUPPORT_BOT_TOKEN.value}`
    },
    body: JSON.stringify({
      content: `${message}`
    })
  });
  if (!response.ok) {
    console.error(await response.text());
    return c.json({
      error: "Discord bot message failed"
    }, {
      status: 502
    });
  }
  return c.json({
    ok: true
  });
})
/**
 * Used by the GitHub action to get GitHub installation access token given the OIDC token
 */.post("/exchange_github_app_token", async c => {
  const EXPECTED_AUDIENCE = "opencode-github-action";
  const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
  const JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;

  // get Authorization header
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({
    error: "Authorization header is required"
  }, {
    status: 401
  });

  // verify token
  const JWKS = createRemoteJWKSet(new URL(JWKS_URL));
  let owner, repo;
  try {
    const {
      payload
    } = await jwtVerify(token, JWKS, {
      issuer: GITHUB_ISSUER,
      audience: EXPECTED_AUDIENCE
    });
    const sub = payload.sub; // e.g. 'repo:my-org/my-repo:ref:refs/heads/main'
    const parts = sub.split(":")[1].split("/");
    owner = parts[0];
    repo = parts[1];
  } catch (err) {
    console.error("Token verification failed:", err);
    return c.json({
      error: "Invalid or expired token"
    }, {
      status: 403
    });
  }

  // Create app JWT token
  const auth = createAppAuth({
    appId: Resource.GITHUB_APP_ID.value,
    privateKey: Resource.GITHUB_APP_PRIVATE_KEY.value
  });
  const appAuth = await auth({
    type: "app"
  });

  // Lookup installation
  const octokit = new Octokit({
    auth: appAuth.token
  });
  const {
    data: installation
  } = await octokit.apps.getRepoInstallation({
    owner,
    repo
  });

  // Get installation token
  const installationAuth = await auth({
    type: "installation",
    installationId: installation.id
  });
  return c.json({
    token: installationAuth.token
  });
})
/**
 * Used by the GitHub action to get GitHub installation access token given user PAT token (used when testing `opencode github run` locally)
 */.post("/exchange_github_app_token_with_pat", async c => {
  const body = await c.req.json();
  const owner = body.owner;
  const repo = body.repo;
  try {
    // get Authorization header
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace(/^Bearer /, "");
    if (!token) throw new Error("Authorization header is required");

    // Verify permissions
    const userClient = new Octokit({
      auth: token
    });
    const {
      data: repoData
    } = await userClient.repos.get({
      owner,
      repo
    });
    if (!repoData.permissions.admin && !repoData.permissions.push && !repoData.permissions.maintain) throw new Error("User does not have write permissions");

    // Get installation token
    const auth = createAppAuth({
      appId: Resource.GITHUB_APP_ID.value,
      privateKey: Resource.GITHUB_APP_PRIVATE_KEY.value
    });
    const appAuth = await auth({
      type: "app"
    });

    // Lookup installation
    const appClient = new Octokit({
      auth: appAuth.token
    });
    const {
      data: installation
    } = await appClient.apps.getRepoInstallation({
      owner,
      repo
    });

    // Get installation token
    const installationAuth = await auth({
      type: "installation",
      installationId: installation.id
    });
    return c.json({
      token: installationAuth.token
    });
  } catch (e) {
    let error = e;
    if (e instanceof Error) {
      error = e.message;
    }
    return c.json({
      error
    }, {
      status: 401
    });
  }
})
/**
 * Used by the opencode CLI to check if the GitHub app is installed
 */.get("/get_github_app_installation", async c => {
  const owner = c.req.query("owner");
  const repo = c.req.query("repo");
  const auth = createAppAuth({
    appId: Resource.GITHUB_APP_ID.value,
    privateKey: Resource.GITHUB_APP_PRIVATE_KEY.value
  });
  const appAuth = await auth({
    type: "app"
  });

  // Lookup installation
  const octokit = new Octokit({
    auth: appAuth.token
  });
  let installation;
  try {
    const ret = await octokit.apps.getRepoInstallation({
      owner,
      repo
    });
    installation = ret.data;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Not Found")) {
      // not installed
    } else {
      throw err;
    }
  }
  return c.json({
    installation
  });
}).all("*", c => c.text("Not Found"));