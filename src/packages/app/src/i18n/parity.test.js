import { describe, expect, test } from "@jest/globals";
import { dict as en } from "./en.js";
import { dict as ar } from "./ar.js";
import { dict as br } from "./br.js";
import { dict as bs } from "./bs.js";
import { dict as da } from "./da.js";
import { dict as de } from "./de.js";
import { dict as es } from "./es.js";
import { dict as fr } from "./fr.js";
import { dict as ja } from "./ja.js";
import { dict as ko } from "./ko.js";
import { dict as no } from "./no.js";
import { dict as pl } from "./pl.js";
import { dict as ru } from "./ru.js";
import { dict as th } from "./th.js";
import { dict as zh } from "./zh.js";
import { dict as zht } from "./zht.js";
import { dict as tr } from "./tr.js";
const locales = [ar, br, bs, da, de, es, fr, ja, ko, no, pl, ru, th, tr, zh, zht];
const keys = ["command.session.previous.unseen", "command.session.next.unseen"];
describe("i18n parity", () => {
  test("non-English locales translate targeted unseen session keys", () => {
    for (const locale of locales) {
      for (const key of keys) {
        expect(locale[key]).toBeDefined();
        expect(locale[key]).not.toBe(en[key]);
      }
    }
  });
});