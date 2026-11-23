// @ts-check

/**
 * @typedef {"want_to_read" | "reading" | "finished"} Status
 * @typedef {"all" | Status} Filter
 * @typedef {object} Book
 * @property {number} id
 * @property {string} title
 * @property {string} author
 * @property {Status} status
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string | null} started_at
 * @property {string | null} finished_at
 * @typedef {object} NewBook
 * @property {string} title
 * @property {string} author
 * @property {Status} status
 */

export {};
