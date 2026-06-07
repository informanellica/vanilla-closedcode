import path from "path";
import {  Effect, FileSystem  } from "effect"
const writeFileStringScoped = Effect.fn("test.writeFileStringScoped")(function* (file, text) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(path.dirname(file), {
    recursive: true
  });
  yield* fs.writeFileString(file, text);
  yield* Effect.addFinalizer(() => fs.remove(file, {
    force: true
  }).pipe(Effect.orDie));
  return file;
});
export { writeFileStringScoped };