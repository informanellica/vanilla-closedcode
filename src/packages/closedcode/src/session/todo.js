import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { SessionID } from "./schema.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import { Effect, Layer, Context, Schema } from "effect";
import { Database } from "#storage/db.js";
export const Info = Schema.Struct({
  content: Schema.String.annotate({
    description: "Brief description of the task"
  }),
  status: Schema.String.annotate({
    description: "Current status of the task: pending, in_progress, completed, cancelled"
  }),
  priority: Schema.String.annotate({
    description: "Priority level of the task: high, medium, low"
  })
}).annotate({
  identifier: "Todo"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const Event = {
  Updated: BusEvent.define("todo.updated", Schema.Struct({
    sessionID: SessionID,
    todos: Schema.Array(Info)
  }))
};
export class Service extends Context.Service()("@closedcode/SessionTodo") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const update = Effect.fn("Todo.update")(function* (input) {
    yield* Effect.promise(() => Database.transactionAsync(async h => {
      await h.models.Todo.destroy({ where: { session_id: input.sessionID }, transaction: h.tx });
      if (input.todos.length === 0) return;
      await h.models.Todo.bulkCreate(input.todos.map((todo, position) => ({
        session_id: input.sessionID,
        content: todo.content,
        status: todo.status,
        priority: todo.priority,
        position
      })), { transaction: h.tx });
    }));
    yield* bus.publish(Event.Updated, input);
  });
  const get = Effect.fn("Todo.get")(function* (sessionID) {
    const rows = yield* Effect.promise(() => Database.useAsync(async h => (await h.models.Todo.findAll({
      where: { session_id: sessionID },
      order: [["position", "ASC"]],
      transaction: h.tx
    })).map(row => row.get({ plain: true }))));
    return rows.map(row => ({
      content: row.content,
      status: row.status,
      priority: row.priority
    }));
  });
  return Service.of({
    update,
    get
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as Todo from "./todo.js";