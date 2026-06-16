/** @file Effect HttpClient decorator that retries transient read failures with jittered exponential backoff. */
import { Schedule } from "effect";
import { HttpClient } from "effect/unstable/http";
/**
 * Wraps an Effect HttpClient so transient failures (errors and retryable responses)
 * are retried up to two times with jittered exponential backoff starting at 200ms.
 *
 * @param {Object} client - The Effect HttpClient to decorate
 * @returns {Object} A new HttpClient that retries transient read failures
 */
export const withTransientReadRetry = client => client.pipe(HttpClient.retryTransient({
  retryOn: "errors-and-responses",
  times: 2,
  schedule: Schedule.exponential(200).pipe(Schedule.jittered)
}));