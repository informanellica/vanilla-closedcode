import { fn } from "core/util/fn";
import { iife } from "core/util/iife";
import z from "zod";
import { Storage } from "./storage.js";
export let Share;
(function (_Share) {
  const Info = _Share.Info = z.object({
    id: z.string(),
    secret: z.string(),
    sessionID: z.string()
  });
  const Data = _Share.Data = z.discriminatedUnion("type", [z.object({
    type: z.literal("session"),
    data: z.custom()
  }), z.object({
    type: z.literal("message"),
    data: z.custom()
  }), z.object({
    type: z.literal("part"),
    data: z.custom()
  }), z.object({
    type: z.literal("session_diff"),
    data: z.custom()
  }), z.object({
    type: z.literal("model"),
    data: z.custom()
  })]);
  function key(item) {
    switch (item.type) {
      case "session":
        return "session";
      case "message":
        return `message/${item.data.id}`;
      case "part":
        return `part/${item.data.messageID}/${item.data.id}`;
      case "session_diff":
        return "session_diff";
      case "model":
        return "model";
    }
  }
  function merge(...items) {
    const map = new Map();
    for (const list of items) {
      for (const item of list) {
        map.set(key(item), item);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
  }
  async function readSnapshot(shareID) {
    return (await Storage.read(["share_snapshot", shareID]))?.data;
  }
  async function writeSnapshot(shareID, data) {
    await Storage.write(["share_snapshot", shareID], {
      data
    });
  }
  async function legacy(shareID) {
    const compaction = (await Storage.read(["share_compaction", shareID])) ?? {
      data: [],
      event: undefined
    };
    const list = await Storage.list({
      prefix: ["share_event", shareID],
      before: compaction.event
    }).then(x => x.toReversed());
    if (list.length === 0) {
      if (compaction.data.length > 0) await writeSnapshot(shareID, compaction.data);
      return compaction.data;
    }
    const next = merge(compaction.data, await Promise.all(list.map(async event => await Storage.read(event))).then(x => x.flatMap(item => item ?? [])));
    await Promise.all([Storage.write(["share_compaction", shareID], {
      event: list.at(-1)?.at(-1),
      data: next
    }), writeSnapshot(shareID, next)]);
    return next;
  }
  const create = _Share.create = fn(z.object({
    sessionID: z.string()
  }), async body => {
    const isTest = process.env.NODE_ENV === "test" || body.sessionID.startsWith("test_");
    const info = {
      id: (isTest ? "test_" : "") + body.sessionID.slice(-8),
      sessionID: body.sessionID,
      secret: crypto.randomUUID()
    };
    const exists = await get(info.id);
    if (exists) throw new Errors.AlreadyExists(info.id);
    await Promise.all([Storage.write(["share", info.id], info), writeSnapshot(info.id, [])]);
    return info;
  });
  async function get(id) {
    return Storage.read(["share", id]);
  }
  _Share.get = get;
  const remove = _Share.remove = fn(Info.pick({
    id: true,
    secret: true
  }), async body => {
    const share = await get(body.id);
    if (!share) throw new Errors.NotFound(body.id);
    if (share.secret !== body.secret) throw new Errors.InvalidSecret(body.id);
    await Storage.remove(["share", body.id]);
    const groups = await Promise.all([Storage.list({
      prefix: ["share_snapshot", body.id]
    }), Storage.list({
      prefix: ["share_compaction", body.id]
    }), Storage.list({
      prefix: ["share_event", body.id]
    }), Storage.list({
      prefix: ["share_data", body.id]
    })]);
    for (const item of groups.flat()) {
      await Storage.remove(item);
    }
  });
  const sync = _Share.sync = fn(z.object({
    share: Info.pick({
      id: true,
      secret: true
    }),
    data: Data.array()
  }), async input => {
    const share = await get(input.share.id);
    if (!share) throw new Errors.NotFound(input.share.id);
    if (share.secret !== input.share.secret) throw new Errors.InvalidSecret(input.share.id);
    const data = (await readSnapshot(input.share.id)) ?? (await legacy(input.share.id));
    await writeSnapshot(input.share.id, merge(data, input.data));
  });
  async function data(shareID) {
    return (await readSnapshot(shareID)) ?? legacy(shareID);
  }
  _Share.data = data;
  const syncOld = _Share.syncOld = fn(z.object({
    share: Info.pick({
      id: true,
      secret: true
    }),
    data: Data.array()
  }), async input => {
    const share = await get(input.share.id);
    if (!share) throw new Errors.NotFound(input.share.id);
    if (share.secret !== input.share.secret) throw new Errors.InvalidSecret(input.share.id);
    const promises = [];
    for (const item of input.data) {
      promises.push(iife(async () => {
        switch (item.type) {
          case "session":
            await Storage.write(["share_data", input.share.id, "session"], item.data);
            break;
          case "message":
            {
              const data = item.data;
              await Storage.write(["share_data", input.share.id, "message", data.id], item.data);
              break;
            }
          case "part":
            {
              const data = item.data;
              await Storage.write(["share_data", input.share.id, "part", data.messageID, data.id], item.data);
              break;
            }
          case "session_diff":
            await Storage.write(["share_data", input.share.id, "session_diff"], item.data);
            break;
          case "model":
            await Storage.write(["share_data", input.share.id, "model"], item.data);
            break;
        }
      }));
    }
    await Promise.all(promises);
  });
  const Errors = _Share.Errors = {
    NotFound: class extends Error {
      constructor(id) {
        super(`Share not found: ${id}`);
        this.id = id;
      }
    },
    InvalidSecret: class extends Error {
      constructor(id) {
        super(`Share secret invalid: ${id}`);
        this.id = id;
      }
    },
    AlreadyExists: class extends Error {
      constructor(id) {
        super(`Share already exists: ${id}`);
        this.id = id;
      }
    }
  };
})(Share || (Share = {}));