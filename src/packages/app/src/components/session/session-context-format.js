import { DateTime } from "luxon";
export function createSessionContextFormatter(locale) {
  return {
    number(value) {
      if (value === undefined) return "—";
      if (value === null) return "—";
      return value.toLocaleString(locale);
    },
    percent(value) {
      if (value === undefined) return "—";
      if (value === null) return "—";
      return value.toLocaleString(locale) + "%";
    },
    time(value) {
      if (!value) return "—";
      return DateTime.fromMillis(value).setLocale(locale).toLocaleString(DateTime.DATETIME_MED);
    }
  };
}