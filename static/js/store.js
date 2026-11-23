// @ts-check

/** @import { Book, Filter } from "./types.js" */

/**
 * @typedef {object} State
 * @property {Book[]} books
 * @property {Filter} filter
 * @property {boolean} loading
 * @property {string | null} loadError
 * @property {ReadonlySet<number>} hiddenIds
 */

/** @param {State} initial */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<(state: State) => void>} */
  const listeners = new Set();

  return {
    get: () => state,

    /** @param {Partial<State> | ((state: State) => Partial<State>)} patch */
    update(patch) {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      for (const listener of listeners) listener(state);
    },

    /** @param {(state: State) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */

/**
 * @param {Book[]} books
 * @param {Book} book
 */
export const replaceBook = (books, book) => books.map((b) => (b.id === book.id ? book : b));

/**
 * @param {Book[]} books
 * @param {number} id
 */
export const withoutBook = (books, id) => books.filter((b) => b.id !== id);

/**
 * @param {ReadonlySet<number>} set
 * @param {number} id
 * @param {boolean} present
 * @returns {ReadonlySet<number>}
 */
export function toggled(set, id, present) {
  const next = new Set(set);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

/** Books the user should currently see on the shelf (ignores the filter). @param {State} state */
export const shelfBooks = (state) => state.books.filter((b) => !state.hiddenIds.has(b.id));
