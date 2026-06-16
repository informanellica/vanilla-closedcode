/** @file Effect Schema definitions for the account domain: branded IDs, account/org records, errors, and device-login poll results. */
import { Schema } from "effect";
/** Branded string schema identifying an account. */
export const AccountID = Schema.String.pipe(Schema.brand("AccountID"));
/** Branded string schema identifying an organization. */
export const OrgID = Schema.String.pipe(Schema.brand("OrgID"));
/** Branded string schema for an OAuth access token. */
export const AccessToken = Schema.String.pipe(Schema.brand("AccessToken"));
/** Branded string schema for an OAuth refresh token. */
export const RefreshToken = Schema.String.pipe(Schema.brand("RefreshToken"));
/** Branded string schema for a device-flow device code. */
export const DeviceCode = Schema.String.pipe(Schema.brand("DeviceCode"));
/** Branded string schema for a device-flow user code. */
export const UserCode = Schema.String.pipe(Schema.brand("UserCode"));
/** Persisted account record: id, email, server URL, and the currently active org id (or null). */
export class Info extends Schema.Class("Account")({
  id: AccountID,
  email: Schema.String,
  url: Schema.String,
  active_org_id: Schema.NullOr(OrgID)
}) {}
/** Organization record: id and display name. */
export class Org extends Schema.Class("Org")({
  id: OrgID,
  name: Schema.String
}) {}
/** Tagged error raised by the account repository (database) layer. */
export class AccountRepoError extends Schema.TaggedErrorClass()("AccountRepoError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
/** Tagged error raised by the account service layer for general failures (HTTP, decoding, etc.). */
export class AccountServiceError extends Schema.TaggedErrorClass()("AccountServiceError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
/** Tagged error for transport-level failures that occur before any HTTP response is received. */
export class AccountTransportError extends Schema.TaggedErrorClass()("AccountTransportError", {
  method: Schema.String,
  url: Schema.String,
  description: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect)
}) {
  /**
   * Build an AccountTransportError from an HTTP client transport error.
   * @param {Object} error - The HTTP client error, carrying request method/url, description, and cause.
   * @returns {AccountTransportError} The transport error populated from the request details.
   */
  static fromHttpClientError(error) {
    return new AccountTransportError({
      method: error.request.method,
      url: error.request.url,
      description: error.description,
      cause: error.cause
    });
  }
  /**
   * Human-readable, multi-line error message describing the unreachable endpoint and remediation hints.
   * @returns {string} The composed message.
   */
  get message() {
    return [`Could not reach ${this.method} ${this.url}.`, `This failed before the server returned an HTTP response.`, this.description, `Check your network, proxy, or VPN configuration and try again.`].filter(Boolean).join("\n");
  }
}
/** Result of initiating device-flow login: codes, verification URL, server, and expiry/poll-interval durations. */
export class Login extends Schema.Class("Login")({
  code: DeviceCode,
  user: UserCode,
  url: Schema.String,
  server: Schema.String,
  expiry: Schema.Duration,
  interval: Schema.Duration
}) {}
/** Poll result: login succeeded and the account email is known. */
export class PollSuccess extends Schema.TaggedClass()("PollSuccess", {
  email: Schema.String
}) {}
/** Poll result: authorization is still pending; keep polling. */
export class PollPending extends Schema.TaggedClass()("PollPending", {}) {}
/** Poll result: the server asked the client to slow down its polling. */
export class PollSlow extends Schema.TaggedClass()("PollSlow", {}) {}
/** Poll result: the device/login code has expired. */
export class PollExpired extends Schema.TaggedClass()("PollExpired", {}) {}
/** Poll result: the user denied the authorization request. */
export class PollDenied extends Schema.TaggedClass()("PollDenied", {}) {}
/** Poll result: an unexpected error occurred while polling. */
export class PollError extends Schema.TaggedClass()("PollError", {
  cause: Schema.Defect
}) {}
/** Union of all possible device-flow poll results. */
export const PollResult = Schema.Union([PollSuccess, PollPending, PollSlow, PollExpired, PollDenied, PollError]);