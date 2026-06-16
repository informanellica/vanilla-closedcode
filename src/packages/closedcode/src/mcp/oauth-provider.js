/**
 * @file MCP OAuth provider that implements the SDK's OAuthClientProvider interface
 * by storing tokens, client info, PKCE verifier and CSRF state via the auth service.
 */
import { Effect } from "effect";
import * as Log from "core/util/log";
const log = Log.create({
  service: "mcp.oauth"
});
/** Default localhost port the OAuth redirect callback server listens on. */
const OAUTH_CALLBACK_PORT = 19876;
/** Default URL path for the OAuth redirect callback. */
const OAUTH_CALLBACK_PATH = "/mcp/oauth/callback";
/**
 * OAuthClientProvider implementation backing MCP authentication, persisting state
 * through the auth service and validating credentials against the current server URL.
 */
export class McpOAuthProvider {
  /**
   * @param {string} mcpName - MCP server name (auth store key).
   * @param {string} serverUrl - Server URL credentials are bound to.
   * @param {Object} config - OAuth config (clientId, clientSecret, scope, redirectUri).
   * @param {Object} callbacks - Callbacks object, notably onRedirect(url).
   * @param {Object} auth - The MCP auth service used for persistence.
   */
  constructor(mcpName, serverUrl, config, callbacks, auth) {
    this.mcpName = mcpName;
    this.serverUrl = serverUrl;
    this.config = config;
    this.callbacks = callbacks;
    this.auth = auth;
  }
  /**
   * The OAuth redirect URL (the configured override, or the default localhost callback).
   * @returns {string} The redirect URL.
   */
  get redirectUrl() {
    if (this.config.redirectUri) {
      return this.config.redirectUri;
    }
    return `http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;
  }
  /**
   * OAuth dynamic client registration metadata for this client.
   * @returns {Object} The client metadata (redirect URIs, name, grant/response types, auth method).
   */
  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: "ClosedCode",
      client_uri: "https://github.com/informanellica/vanilla-closedcode",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.config.clientSecret ? "client_secret_post" : "none"
    };
  }
  /**
   * Resolve the OAuth client credentials, preferring config, then stored (URL-validated,
   * non-expired) registration info; returns undefined to trigger dynamic registration.
   * @returns {Promise<Object>} The {client_id, client_secret}, or undefined.
   */
  async clientInformation() {
    // Check config first (pre-registered client)
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      };
    }

    // Check stored client info (from dynamic registration)
    // Use getForUrl to validate credentials are for the current server URL
    const entry = await Effect.runPromise(this.auth.getForUrl(this.mcpName, this.serverUrl));
    if (entry?.clientInfo) {
      // Check if client secret has expired
      if (entry.clientInfo.clientSecretExpiresAt && entry.clientInfo.clientSecretExpiresAt < Date.now() / 1000) {
        log.info("client secret expired, need to re-register", {
          mcpName: this.mcpName
        });
        return undefined;
      }
      return {
        client_id: entry.clientInfo.clientId,
        client_secret: entry.clientInfo.clientSecret
      };
    }

    // No client info or URL changed - will trigger dynamic registration
    return undefined;
  }
  /**
   * Persist dynamically registered client information bound to the current server URL.
   * @param {Object} info - Registration response (client_id, client_secret, issued/expiry timestamps).
   * @returns {Promise<void>} Resolves once stored.
   */
  async saveClientInformation(info) {
    await Effect.runPromise(this.auth.updateClientInfo(this.mcpName, {
      clientId: info.client_id,
      clientSecret: info.client_secret,
      clientIdIssuedAt: info.client_id_issued_at,
      clientSecretExpiresAt: info.client_secret_expires_at
    }, this.serverUrl));
    log.info("saved dynamically registered client", {
      mcpName: this.mcpName,
      clientId: info.client_id
    });
  }
  /**
   * Return stored OAuth tokens for the current server URL in SDK token format.
   * @returns {Promise<Object>} The {access_token, token_type, refresh_token, expires_in, scope}, or undefined.
   */
  async tokens() {
    // Use getForUrl to validate tokens are for the current server URL
    const entry = await Effect.runPromise(this.auth.getForUrl(this.mcpName, this.serverUrl));
    if (!entry?.tokens) return undefined;
    return {
      access_token: entry.tokens.accessToken,
      token_type: "Bearer",
      refresh_token: entry.tokens.refreshToken,
      expires_in: entry.tokens.expiresAt ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1000)) : undefined,
      scope: entry.tokens.scope
    };
  }
  /**
   * Persist OAuth tokens, converting expires_in into an absolute expiry timestamp.
   * @param {Object} tokens - SDK token response (access_token, refresh_token, expires_in, scope).
   * @returns {Promise<void>} Resolves once stored.
   */
  async saveTokens(tokens) {
    await Effect.runPromise(this.auth.updateTokens(this.mcpName, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
      scope: tokens.scope
    }, this.serverUrl));
    log.info("saved oauth tokens", {
      mcpName: this.mcpName
    });
  }
  /**
   * Drive the authorization redirect by invoking the configured onRedirect callback.
   * @param {URL} authorizationUrl - The provider authorization URL to open.
   * @returns {Promise<void>} Resolves after the callback completes.
   */
  async redirectToAuthorization(authorizationUrl) {
    log.info("redirecting to authorization", {
      mcpName: this.mcpName,
      url: authorizationUrl.toString()
    });
    await this.callbacks.onRedirect(authorizationUrl);
  }
  /**
   * Persist the PKCE code verifier for the current flow.
   * @param {string} codeVerifier - The PKCE code verifier to store.
   * @returns {Promise<void>} Resolves once stored.
   */
  async saveCodeVerifier(codeVerifier) {
    await Effect.runPromise(this.auth.updateCodeVerifier(this.mcpName, codeVerifier));
  }
  /**
   * Retrieve the stored PKCE code verifier, throwing if none was saved.
   * @returns {Promise<string>} The code verifier.
   */
  async codeVerifier() {
    const entry = await Effect.runPromise(this.auth.get(this.mcpName));
    if (!entry?.codeVerifier) {
      throw new Error(`No code verifier saved for MCP server: ${this.mcpName}`);
    }
    return entry.codeVerifier;
  }
  /**
   * Persist the OAuth CSRF state for the current flow.
   * @param {string} state - The CSRF state value to store.
   * @returns {Promise<void>} Resolves once stored.
   */
  async saveState(state) {
    await Effect.runPromise(this.auth.updateOAuthState(this.mcpName, state));
  }
  /**
   * Return the OAuth CSRF state, generating and persisting a new one if none exists.
   * @returns {Promise<string>} The CSRF state value.
   */
  async state() {
    const entry = await Effect.runPromise(this.auth.get(this.mcpName));
    if (entry?.oauthState) {
      return entry.oauthState;
    }

    // Generate a new state if none exists — the SDK calls state() as a
    // generator, not just a reader, so we need to produce a value even when
    // startAuth() hasn't pre-saved one (e.g. during automatic auth on first
    // connect).
    const newState = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("");
    await Effect.runPromise(this.auth.updateOAuthState(this.mcpName, newState));
    return newState;
  }
  /**
   * Invalidate stored credentials of a given scope.
   * @param {string} type - One of "all", "client", or "tokens".
   * @returns {Promise<void>} Resolves once the relevant credentials are removed.
   */
  async invalidateCredentials(type) {
    log.info("invalidating credentials", {
      mcpName: this.mcpName,
      type
    });
    const entry = await Effect.runPromise(this.auth.get(this.mcpName));
    if (!entry) {
      return;
    }
    switch (type) {
      case "all":
        await Effect.runPromise(this.auth.remove(this.mcpName));
        break;
      case "client":
        delete entry.clientInfo;
        await Effect.runPromise(this.auth.set(this.mcpName, entry));
        break;
      case "tokens":
        delete entry.tokens;
        await Effect.runPromise(this.auth.set(this.mcpName, entry));
        break;
    }
  }
}
export { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH };

/**
 * Parse a redirect URI to extract port and path for the callback server.
 * Returns defaults if the URI can't be parsed.
 * @param {string} redirectUri - Optional redirect URI to parse.
 * @returns {Object} An object with the resolved {port, path}.
 */
export function parseRedirectUri(redirectUri) {
  if (!redirectUri) {
    return {
      port: OAUTH_CALLBACK_PORT,
      path: OAUTH_CALLBACK_PATH
    };
  }
  try {
    const url = new URL(redirectUri);
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
    const path = url.pathname || OAUTH_CALLBACK_PATH;
    return {
      port,
      path
    };
  } catch {
    return {
      port: OAUTH_CALLBACK_PORT,
      path: OAUTH_CALLBACK_PATH
    };
  }
}