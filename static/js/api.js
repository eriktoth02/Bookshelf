// @ts-check

/** @import { Book, NewBook, Status } from "./types.js" */

const BASE_URL = "/api/books";

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {unknown} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get existingBook() {
    const body = /** @type {{ existing?: Book } | undefined} */ (this.body);
    return this.status === 409 ? (body?.existing ?? null) : null;
  }
}

/**
 * @template T
 * @param {string} path
 * @param {{ method?: string, body?: unknown, keepalive?: boolean }} [options]
 * @returns {Promise<T>}
 */
async function request(path, { method = "GET", body, keepalive = false } = {}) {
  /** @type {Response} */
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      keepalive,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check that it's running.", 0);
  }

  if (response.status === 204) return /** @type {T} */ (undefined);

  const data = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(errorMessage(data, response.status), response.status, data);
  return data;
}

/**
 * @param {any} data
 * @param {number} status
 */
function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
  return `Request failed (${status}).`;
}

export const booksApi = {
  /** @returns {Promise<Book[]>} */
  list: () => request(""),

  /** @param {NewBook} book @returns {Promise<Book>} */
  create: (book) => request("", { method: "POST", body: book }),

  /** @param {number} id @param {Status} status @returns {Promise<Book>} */
  setStatus: (id, status) => request(`/${id}`, { method: "PATCH", body: { status } }),

  /**
   * @param {number} id
   * @param {{ keepalive?: boolean }} [options]
   * @returns {Promise<void>}
   */
  remove: (id, { keepalive = false } = {}) => request(`/${id}`, { method: "DELETE", keepalive }),
};
