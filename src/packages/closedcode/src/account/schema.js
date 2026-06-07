import { Schema } from "effect";
export const AccountID = Schema.String.pipe(Schema.brand("AccountID"));
export const OrgID = Schema.String.pipe(Schema.brand("OrgID"));
export const AccessToken = Schema.String.pipe(Schema.brand("AccessToken"));
export const RefreshToken = Schema.String.pipe(Schema.brand("RefreshToken"));
export const DeviceCode = Schema.String.pipe(Schema.brand("DeviceCode"));
export const UserCode = Schema.String.pipe(Schema.brand("UserCode"));
export class Info extends Schema.Class("Account")({
  id: AccountID,
  email: Schema.String,
  url: Schema.String,
  active_org_id: Schema.NullOr(OrgID)
}) {}
export class Org extends Schema.Class("Org")({
  id: OrgID,
  name: Schema.String
}) {}
export class AccountRepoError extends Schema.TaggedErrorClass()("AccountRepoError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
export class AccountServiceError extends Schema.TaggedErrorClass()("AccountServiceError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
export class AccountTransportError extends Schema.TaggedErrorClass()("AccountTransportError", {
  method: Schema.String,
  url: Schema.String,
  description: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect)
}) {
  static fromHttpClientError(error) {
    return new AccountTransportError({
      method: error.request.method,
      url: error.request.url,
      description: error.description,
      cause: error.cause
    });
  }
  get message() {
    return [`Could not reach ${this.method} ${this.url}.`, `This failed before the server returned an HTTP response.`, this.description, `Check your network, proxy, or VPN configuration and try again.`].filter(Boolean).join("\n");
  }
}
export class Login extends Schema.Class("Login")({
  code: DeviceCode,
  user: UserCode,
  url: Schema.String,
  server: Schema.String,
  expiry: Schema.Duration,
  interval: Schema.Duration
}) {}
export class PollSuccess extends Schema.TaggedClass()("PollSuccess", {
  email: Schema.String
}) {}
export class PollPending extends Schema.TaggedClass()("PollPending", {}) {}
export class PollSlow extends Schema.TaggedClass()("PollSlow", {}) {}
export class PollExpired extends Schema.TaggedClass()("PollExpired", {}) {}
export class PollDenied extends Schema.TaggedClass()("PollDenied", {}) {}
export class PollError extends Schema.TaggedClass()("PollError", {
  cause: Schema.Defect
}) {}
export const PollResult = Schema.Union([PollSuccess, PollPending, PollSlow, PollExpired, PollDenied, PollError]);