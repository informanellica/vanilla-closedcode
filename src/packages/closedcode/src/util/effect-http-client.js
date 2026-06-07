import { Schedule } from "effect";
import { HttpClient } from "effect/unstable/http";
export const withTransientReadRetry = client => client.pipe(HttpClient.retryTransient({
  retryOn: "errors-and-responses",
  times: 2,
  schedule: Schedule.exponential(200).pipe(Schedule.jittered)
}));