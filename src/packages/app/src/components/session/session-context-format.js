/** @file Locale-aware value formatters for the session context tab (numbers, percents, timestamps). */
import { DateTime } from "luxon";
/**
 * Create a set of formatters that render numbers, percentages, and timestamps
 * for a given locale, using an em dash placeholder for missing values.
 * @param {string} locale - BCP 47 locale tag used for number and date formatting.
 * @returns {Object} Formatter object with number(value), percent(value), and time(value) methods.
 */
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