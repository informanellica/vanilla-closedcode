/** @file CLI `console` subcommands for managing accounts: login (device-code flow), logout, org switch/list, and open. */
import { cmd } from "./cmd.js";
import { Duration, Effect, Match, Option } from "effect";
import { UI } from "../ui.js";
import { Account } from "#account/account.js";
import { PollExpired } from "#account/schema.js";
import { effectCmd } from "../effect-cmd.js";
import * as Prompt from "../effect/prompt.js";
import open from "open";
/**
 * Open a URL in the default browser, swallowing any failure.
 * @param {string} url - URL to open.
 * @returns {Effect} Effect that resolves regardless of whether opening succeeded.
 */
const openBrowser = url => Effect.promise(() => open(url).catch(() => undefined));
/**
 * Print a line to the UI inside an Effect.
 * @param {string} msg - Message to print.
 * @returns {Effect} Effect that writes the line.
 */
const println = msg => Effect.sync(() => UI.println(msg));
/**
 * Wrap a value in dim styling escape codes.
 * @param {string} value - Text to dim.
 * @returns {string} The text surrounded by dim/normal style codes.
 */
const dim = value => UI.Style.TEXT_DIM + value + UI.Style.TEXT_NORMAL;
/**
 * Produce a dimmed " (active)" suffix when a row is the active selection.
 * @param {boolean} isActive - Whether the item is currently active.
 * @returns {string} The suffix, or an empty string when not active.
 */
const activeSuffix = isActive => isActive ? dim(" (active)") : "";
/**
 * Format a one-line label for an account (email + dimmed URL + optional active suffix).
 * @param {{email: string, url: string}} account - Account to label.
 * @param {boolean} isActive - Whether this account is currently active.
 * @returns {string} The formatted label.
 */
export const formatAccountLabel = (account, isActive) => `${account.email} ${dim(account.url)}${activeSuffix(isActive)}`;
/**
 * Format a select-choice label for an org within an account.
 * @param {{email: string}} account - Owning account.
 * @param {{name: string}} org - Org being labeled.
 * @param {boolean} isActive - Whether this org is currently active.
 * @returns {string} The formatted choice label.
 */
const formatOrgChoiceLabel = (account, org, isActive) => `${org.name} (${account.email})${activeSuffix(isActive)}`;
/**
 * Format a listing line for an org, with an active-marker dot and styled name plus dimmed metadata.
 * @param {{email: string, url: string}} account - Owning account.
 * @param {{name: string, id: string}} org - Org being listed.
 * @param {boolean} isActive - Whether this org is currently active.
 * @returns {string} The formatted listing line.
 */
export const formatOrgLine = (account, org, isActive) => {
  const dot = isActive ? UI.Style.TEXT_SUCCESS + "●" + UI.Style.TEXT_NORMAL : " ";
  const name = isActive ? UI.Style.TEXT_HIGHLIGHT_BOLD + org.name + UI.Style.TEXT_NORMAL : org.name;
  return `  ${dot} ${name}  ${dim(account.email)}  ${dim(account.url)}  ${dim(org.id)}`;
};
/**
 * Determine whether a given account/org choice matches the currently active account and org.
 * @param {Option} active - Option of the active account (with `id` and `active_org_id`).
 * @param {{accountID: string, orgID: string}} choice - Candidate account/org pair.
 * @returns {boolean} True when the choice is the active account and org.
 */
const isActiveOrgChoice = (active, choice) => Option.isSome(active) && active.value.id === choice.accountID && active.value.active_org_id === choice.orgID;
/**
 * Run the device-code login flow: request a code, prompt the user, poll until authorized/expired, and report the result.
 * @param {string} url - Server URL to log in against.
 * @returns {Effect} Effect that drives the interactive login and prints the outcome.
 */
const loginEffect = Effect.fn("login")(function* (url) {
  const service = yield* Account.Service;
  yield* Prompt.intro("Log in");
  const login = yield* service.login(url);
  yield* Prompt.log.info("Go to: " + login.url);
  yield* Prompt.log.info("Enter code: " + login.user);
  yield* openBrowser(login.url);
  const s = Prompt.spinner();
  yield* s.start("Waiting for authorization...");
  /**
   * Recursively poll the authorization endpoint, backing off by 5s when the server signals "slow down".
   * @param {Duration} wait - Delay before the next poll attempt.
   * @returns {Effect} Effect yielding the terminal poll result (success/denied/error/expired).
   */
  const poll = wait => Effect.gen(function* () {
    yield* Effect.sleep(wait);
    const result = yield* service.poll(login);
    if (result._tag === "PollPending") return yield* poll(wait);
    if (result._tag === "PollSlow") return yield* poll(Duration.sum(wait, Duration.seconds(5)));
    return result;
  });
  const result = yield* poll(login.interval).pipe(Effect.timeout(login.expiry), Effect.catchTag("TimeoutError", () => Effect.succeed(new PollExpired())));
  yield* Match.valueTags(result, {
    PollSuccess: r => Effect.gen(function* () {
      yield* s.stop("Logged in as " + r.email);
      yield* Prompt.outro("Done");
    }),
    PollExpired: () => s.stop("Device code expired", 1),
    PollDenied: () => s.stop("Authorization denied", 1),
    PollError: r => s.stop("Error: " + String(r.cause), 1),
    PollPending: () => s.stop("Unexpected state", 1),
    PollSlow: () => s.stop("Unexpected state", 1)
  });
});
/**
 * Log out of an account: remove the named account directly, or prompt the user to pick one when no email is given.
 * @param {string} email - Optional email of the account to log out from; if omitted, prompts interactively.
 * @returns {Effect} Effect that performs the logout and prints the outcome.
 */
const logoutEffect = Effect.fn("logout")(function* (email) {
  const service = yield* Account.Service;
  const accounts = yield* service.list();
  if (accounts.length === 0) return yield* println("Not logged in");
  if (email) {
    const match = accounts.find(a => a.email === email);
    if (!match) return yield* println("Account not found: " + email);
    yield* service.remove(match.id);
    yield* Prompt.outro("Logged out from " + email);
    return;
  }
  const active = yield* service.active();
  const activeID = Option.map(active, a => a.id);
  yield* Prompt.intro("Log out");
  const opts = accounts.map(a => {
    const isActive = Option.isSome(activeID) && activeID.value === a.id;
    return {
      value: a,
      label: formatAccountLabel(a, isActive)
    };
  });
  const selected = yield* Prompt.select({
    message: "Select account to log out",
    options: opts
  });
  if (Option.isNone(selected)) return;
  yield* service.remove(selected.value.id);
  yield* Prompt.outro("Logged out from " + selected.value.email);
});
/**
 * Prompt the user to select an org across all logged-in accounts and switch the active org to it.
 * @returns {Effect} Effect that performs the org switch and prints the outcome.
 */
const switchEffect = Effect.fn("switch")(function* () {
  const service = yield* Account.Service;
  const groups = yield* service.orgsByAccount();
  if (groups.length === 0) return yield* println("Not logged in");
  const active = yield* service.active();
  const opts = groups.flatMap(group => group.orgs.map(org => {
    const isActive = isActiveOrgChoice(active, {
      accountID: group.account.id,
      orgID: org.id
    });
    return {
      value: {
        orgID: org.id,
        accountID: group.account.id,
        label: org.name
      },
      label: formatOrgChoiceLabel(group.account, org, isActive)
    };
  }));
  if (opts.length === 0) return yield* println("No orgs found");
  yield* Prompt.intro("Switch org");
  const selected = yield* Prompt.select({
    message: "Select org",
    options: opts
  });
  if (Option.isNone(selected)) return;
  const choice = selected.value;
  yield* service.use(choice.accountID, Option.some(choice.orgID));
  yield* Prompt.outro("Switched to " + choice.label);
});
/**
 * List every org across all logged-in accounts, marking the active one.
 * @returns {Effect} Effect that prints the org listing.
 */
const orgsEffect = Effect.fn("orgs")(function* () {
  const service = yield* Account.Service;
  const groups = yield* service.orgsByAccount();
  if (groups.length === 0) return yield* println("No accounts found");
  if (!groups.some(group => group.orgs.length > 0)) return yield* println("No orgs found");
  const active = yield* service.active();
  for (const group of groups) {
    for (const org of group.orgs) {
      const isActive = isActiveOrgChoice(active, {
        accountID: group.account.id,
        orgID: org.id
      });
      yield* println(formatOrgLine(group.account, org, isActive));
    }
  }
});
/**
 * Open the active account's server URL in the browser.
 * @returns {Effect} Effect that opens the URL or reports that no account is active.
 */
const openEffect = Effect.fn("open")(function* () {
  const service = yield* Account.Service;
  const active = yield* service.active();
  if (Option.isNone(active)) return yield* println("No active account");
  const url = active.value.url;
  yield* openBrowser(url);
  yield* Prompt.outro("Opened " + url);
});
/** CLI command: `login <url>` — runs the interactive device-code login flow. */
export const LoginCommand = effectCmd({
  command: "login <url>",
  describe: false,
  instance: false,
  builder: yargs => yargs.positional("url", {
    describe: "server URL",
    type: "string",
    demandOption: true
  }),
  handler: Effect.fn("Cli.account.login")(function* (args) {
    UI.empty();
    yield* Effect.orDie(loginEffect(args.url));
  })
});
/** CLI command: `logout [email]` — logs out from a named or interactively selected account. */
export const LogoutCommand = effectCmd({
  command: "logout [email]",
  describe: false,
  instance: false,
  builder: yargs => yargs.positional("email", {
    describe: "account email to log out from",
    type: "string"
  }),
  handler: Effect.fn("Cli.account.logout")(function* (args) {
    UI.empty();
    yield* Effect.orDie(logoutEffect(args.email));
  })
});
/** CLI command: `switch` — interactively switches the active org. */
export const SwitchCommand = effectCmd({
  command: "switch",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.account.switch")(function* () {
    UI.empty();
    yield* Effect.orDie(switchEffect());
  })
});
/** CLI command: `orgs` — lists all orgs across logged-in accounts. */
export const OrgsCommand = effectCmd({
  command: "orgs",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.account.orgs")(function* () {
    UI.empty();
    yield* Effect.orDie(orgsEffect());
  })
});
/** CLI command: `open` — opens the active account's URL in the browser. */
export const OpenCommand = effectCmd({
  command: "open",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.account.open")(function* () {
    UI.empty();
    yield* Effect.orDie(openEffect());
  })
});
/** CLI command: `console` — parent command grouping the account login/logout/switch/orgs/open subcommands. */
export const ConsoleCommand = cmd({
  command: "console",
  describe: false,
  builder: yargs => yargs.command({
    ...LoginCommand,
    describe: "log in to console"
  }).command({
    ...LogoutCommand,
    describe: "log out from console"
  }).command({
    ...SwitchCommand,
    describe: "switch active org"
  }).command({
    ...OrgsCommand,
    describe: "list orgs"
  }).command({
    ...OpenCommand,
    describe: "open active console account"
  }).demandCommand(),
  async handler() {}
});