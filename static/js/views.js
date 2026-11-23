// @ts-check

import { FILTER_LABELS, STATUS_LABELS } from "./constants.js";
import { formatDate, h } from "./dom.js";
import { shelfBooks } from "./store.js";

/** @import { Book, Filter, Status } from "./types.js" */
/** @import { State } from "./store.js" */

/** @param {State} state */
export function renderFilters(state) {
  const books = shelfBooks(state);
  const entries = /** @type {[Filter, string][]} */ (Object.entries(FILTER_LABELS));

  return entries.map(([filter, label]) => {
    const count = filter === "all" ? books.length : books.filter((b) => b.status === filter).length;
    return h(
      "button",
      { type: "button", class: "filter", "data-filter": filter, "aria-pressed": String(state.filter === filter) },
      `${label} `,
      h("span", { class: "count" }, String(count)),
    );
  });
}

/** @param {State} state */
export function renderList(state) {
  if (state.loading && state.books.length === 0) {
    return placeholder("Loading your shelf…");
  }

  if (state.loadError) {
    return h(
      "div",
      { class: "card error-state", role: "alert" },
      h("p", {}, `Couldn't load your books. ${state.loadError}`),
      h("button", { type: "button", "data-action": "retry" }, "Try again"),
    );
  }

  const books = shelfBooks(state);
  const visible = state.filter === "all" ? books : books.filter((b) => b.status === state.filter);

  if (visible.length === 0) {
    return placeholder(
      books.length === 0
        ? "Your shelf is empty. Add the first book above."
        : `Nothing in “${FILTER_LABELS[state.filter]}” yet.`,
    );
  }

  return h("ul", { class: "books" }, ...visible.map(bookItem));
}

/** @param {Book} book */
function bookItem(book) {
  const statuses = /** @type {[Status, string][]} */ (Object.entries(STATUS_LABELS));

  return h(
    "li",
    { class: `card book status-${book.status}`, "data-id": book.id },
    h(
      "div",
      { class: "book-main" },
      h("p", { class: "book-title" }, book.title),
      h("p", { class: "book-author" }, book.author),
      h("p", { class: "book-meta" }, describeProgress(book)),
    ),
    h(
      "div",
      { class: "book-actions" },
      h(
        "select",
        { class: "status-select", "data-action": "set-status", "aria-label": `Status of ${book.title}` },
        ...statuses.map(([value, label]) =>
          h("option", { value, selected: value === book.status }, label),
        ),
      ),
      h(
        "button",
        { type: "button", class: "remove", "data-action": "remove", "aria-label": `Remove ${book.title}` },
        "Remove",
      ),
    ),
  );
}

/** @param {Book} book */
function describeProgress(book) {
  if (book.status === "finished" && book.finished_at) return `Finished ${formatDate(book.finished_at)}`;
  if (book.status === "reading" && book.started_at) return `Started ${formatDate(book.started_at)}`;
  return `Added ${formatDate(book.created_at)}`;
}

/** @param {string} message */
const placeholder = (message) => h("p", { class: "placeholder" }, message);
