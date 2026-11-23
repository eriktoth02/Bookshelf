// @ts-check

/** @import { Filter, Status } from "./types.js" */

/** @type {Readonly<Record<Status, string>>} */
export const STATUS_LABELS = Object.freeze({
  want_to_read: "Want to read",
  reading: "Reading",
  finished: "Finished",
});

/** @type {Readonly<Record<Filter, string>>} */
export const FILTER_LABELS = Object.freeze({ all: "All", ...STATUS_LABELS });

export const UNDO_WINDOW_MS = 5000;

export const TOAST_MS = 4000;

/**
 * @param {unknown} value
 * @returns {value is Filter}
 */
export function isFilter(value) {
  return typeof value === "string" && Object.hasOwn(FILTER_LABELS, value);
}
