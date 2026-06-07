import * as prompts from "@clack/prompts";
import { Effect, Option } from "effect";
export const intro = msg => Effect.sync(() => prompts.intro(msg));
export const outro = msg => Effect.sync(() => prompts.outro(msg));
export const log = {
  info: msg => Effect.sync(() => prompts.log.info(msg))
};
export const select = opts => Effect.tryPromise(() => prompts.select(opts)).pipe(Effect.map(result => {
  if (prompts.isCancel(result)) return Option.none();
  return Option.some(result);
}));
export const spinner = () => {
  const s = prompts.spinner();
  return {
    start: msg => Effect.sync(() => s.start(msg)),
    stop: (msg, code) => Effect.sync(() => s.stop(msg, code))
  };
};