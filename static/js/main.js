// @ts-check

import { ApiError, booksApi } from "./api.js";
import { STATUS_LABELS, UNDO_WINDOW_MS, isFilter } from "./constants.js";
import { byId, h } from "./dom.js";
import { createStore, replaceBook, toggled, withoutBook } from "./store.js";
import { showToast } from "./toast.js";
import { renderFilters, renderList } from "./views.js";

/** @import { Filter, Status } from "./types.js" */
/** @import { State } from "./store.js" */

const form = byId("add-form", HTMLFormElement);
const titleInput = byId("title", HTMLInputElement);
const authorInput = byId("author", HTMLInputElement);
const statusSelect = byId("status", HTMLSelectElement);
const submitButton = byId("add-button", HTMLButtonElement);
const formError = byId("form-error", HTMLParagraphElement);
const filtersNav = byId("filters", HTMLElement);
const listRegion = byId("list-region", HTMLElement);

const store = createStore({
  books: [],
  filter: filterFromUrl(),
  loading: true,
  loadError: null,
  hiddenIds: new Set(),
});

/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const pendingDeletes = new Map();

async function loadBooks() {
  store.update({ loading: true, loadError: null });
  try {
    store.update({ books: await booksApi.list() });
  } catch (error) {
    store.update({ loadError: messageOf(error) });
  } finally {
    store.update({ loading: false });
  }
}

/** @param {SubmitEvent} event */
async function addBook(event) {
  event.preventDefault();
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!title || !author) {
    setFormError("Title and author are both required.");
    (title ? authorInput : titleInput).focus();
    return;
  }

  setFormError(null);
  setSubmitting(true);
  try {
    const book = await booksApi.create({ title, author, status: /** @type {Status} */ (statusSelect.value) });
    store.update(({ books, filter }) => ({
      books: [book, ...books],
      filter: filter === "all" || filter === book.status ? filter : "all",
    }));
    form.reset();
    titleInput.focus();
  } catch (error) {
    setFormError(duplicateMessage(error) ?? messageOf(error));
  } finally {
    setSubmitting(false);
  }
}

/**
 * @param {number} id
 * @param {Status} status
 */
async function setStatus(id, status) {
  const previous = findBook(id);
  if (!previous || previous.status === status) return;

  store.update(({ books }) => ({ books: replaceBook(books, { ...previous, status }) }));
  try {
    const saved = await booksApi.setStatus(id, status);
    store.update(({ books }) => ({ books: replaceBook(books, saved) }));
  } catch (error) {
    store.update(({ books }) => ({ books: replaceBook(books, previous) }));
    showToast(`Couldn't update “${previous.title}”: ${messageOf(error)}`);
  }
}

/** @param {number} id */
function removeBook(id) {
  const book = findBook(id);
  if (!book || pendingDeletes.has(id)) return;

  pendingDeletes.set(id, setTimeout(() => commitDelete(id), UNDO_WINDOW_MS));
  store.update(({ hiddenIds }) => ({ hiddenIds: toggled(hiddenIds, id, true) }));
  showToast(`Removed “${book.title}”.`, {
    durationMs: UNDO_WINDOW_MS,
    action: { label: "Undo", onClick: () => undoRemove(id) },
  });
}

/** @param {number} id */
function undoRemove(id) {
  clearTimeout(pendingDeletes.get(id));
  pendingDeletes.delete(id);
  store.update(({ hiddenIds }) => ({ hiddenIds: toggled(hiddenIds, id, false) }));
}

/**
 * @param {number} id
 * @param {{ keepalive?: boolean }} [options]
 */
async function commitDelete(id, { keepalive = false } = {}) {
  pendingDeletes.delete(id);
  try {
    await booksApi.remove(id, { keepalive });
    store.update(({ books, hiddenIds }) => ({ books: withoutBook(books, id), hiddenIds: toggled(hiddenIds, id, false) }));
  } catch (error) {
    const gone = error instanceof ApiError && error.status === 404;
    const title = findBook(id)?.title ?? "book";
    store.update(({ books, hiddenIds }) => ({
      books: gone ? withoutBook(books, id) : books,
      hiddenIds: toggled(hiddenIds, id, false),
    }));
    if (!gone) showToast(`Couldn't remove “${title}”: ${messageOf(error)}`);
  }
}

function flushPendingDeletes() {
  for (const [id, timer] of pendingDeletes) {
    clearTimeout(timer);
    void commitDelete(id, { keepalive: true });
  }
}

/** @param {Filter} filter */
function setFilter(filter) {
  store.update({ filter });
}

/** @param {State} state */
function render(state) {
  filtersNav.replaceChildren(...renderFilters(state));
  listRegion.replaceChildren(renderList(state));
  listRegion.setAttribute("aria-busy", String(state.loading));
}

/** @param {State} state */
function syncUrl({ filter }) {
  const hash = filter === "all" ? "" : `#${filter}`;
  if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname);
}

/** @param {number} id */
const findBook = (id) => store.get().books.find((b) => b.id === id);

/** @returns {Filter} */
function filterFromUrl() {
  const value = location.hash.slice(1);
  return isFilter(value) ? value : "all";
}

/** @param {unknown} error */
function duplicateMessage(error) {
  const existing = error instanceof ApiError ? error.existingBook : null;
  return existing
    ? `“${existing.title}” by ${existing.author} is already on your shelf (${STATUS_LABELS[existing.status]}).`
    : null;
}

/** @param {unknown} error */
const messageOf = (error) => (error instanceof Error ? error.message : "Something went wrong.");

/** @param {string | null} message */
function setFormError(message) {
  formError.hidden = !message;
  formError.textContent = message ?? "";
}

/** @param {boolean} submitting */
function setSubmitting(submitting) {
  submitButton.disabled = submitting;
  submitButton.textContent = submitting ? "Adding…" : "Add book";
}

/**
 * @param {Event} event
 * @returns {{ element: HTMLElement, id: number } | null} the closest data-action element and its book id
 */
function actionTarget(event) {
  const element = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!(element instanceof HTMLElement)) return null;
  const id = Number(element.closest("[data-id]")?.getAttribute("data-id"));
  return { element, id };
}

statusSelect.append(...Object.entries(STATUS_LABELS).map(([value, label]) => h("option", { value }, label)));

form.addEventListener("submit", addBook);

filtersNav.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-filter]") : null;
  const filter = button?.getAttribute("data-filter");
  if (isFilter(filter)) setFilter(filter);
});

listRegion.addEventListener("click", (event) => {
  const target = actionTarget(event);
  if (target?.element.dataset.action === "remove") removeBook(target.id);
  if (target?.element.dataset.action === "retry") void loadBooks();
});

listRegion.addEventListener("change", (event) => {
  const target = actionTarget(event);
  if (target?.element instanceof HTMLSelectElement && target.element.dataset.action === "set-status") {
    void setStatus(target.id, /** @type {Status} */ (target.element.value));
  }
});

window.addEventListener("hashchange", () => setFilter(filterFromUrl()));
window.addEventListener("pagehide", flushPendingDeletes);

store.subscribe(render);
store.subscribe(syncUrl);
render(store.get());
void loadBooks();
