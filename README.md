# Personal Bookshelf

A small single-user reading list: add books, track whether you want to read them, are reading them or have finished them, filter by status, and remove them.

**Stack:** FastAPI · SQLAlchemy 2.0 · SQLite · vanilla JS (ES modules, no build step), all served by one process.

## Running it

Requires Python 3.10+.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000. Interactive API docs are at http://127.0.0.1:8000/docs.

The SQLite database is created on first start as `bookshelf.db` in the working directory. Set `BOOKSHELF_DATABASE_URL` to use a different location.

## Development

```bash
pip install -r requirements-dev.txt
pytest                 # unit + API tests
ruff format . && ruff check .
mypy                   # strict mode, app + tests
npx -p typescript tsc -p jsconfig.json   # optional: type-check the JS (JSDoc)
```

The same checks run in GitHub Actions on every push (`.github/workflows/ci.yml`), on Python 3.10 and 3.13.

## Architecture

```
app/
  main.py      create_app(): wires settings, DB, routes, error handlers, static files
  config.py    Settings, read from the environment
  api.py       HTTP routes: thin, only validate → call service → respond
  service.py   BookService: the use cases, HTTP-agnostic, raises domain errors
  models.py    Book ORM model + domain rules (identity, status transitions)
  schemas.py   Pydantic request/response models: the API contract
  errors.py    domain errors and their mapping to HTTP responses, in one place
  db.py        engine/session factories, UTC datetime column type
static/
  index.html, styles.css
  js/main.js       entry point: store, actions, event wiring
  js/views.js      pure render functions (state → DOM)
  js/store.js      minimal observable store + pure state helpers
  js/api.js        fetch wrapper, ApiError, typed endpoints
  js/toast.js, dom.js, constants.js, types.js
tests/
  test_models.py   domain rules, no DB or HTTP
  test_api.py      HTTP behaviour against a temporary SQLite file
```

Each layer only talks to the one below: routes know nothing about SQL, the service knows nothing about HTTP status codes, and the business rules sit on the model where they can be unit-tested directly. An app factory (`create_app(settings)`) means tests build their own app against a throwaway database instead of patching globals.

For one resource that's about as much structure as is worth having. I deliberately didn't add a repository layer on top of the SQLAlchemy session, dependency-injection containers or a `books/` feature package; they would be reasonable once there are several resources.

## API

| Method | Path | Success | Errors |
|---|---|---|---|
| `GET` | `/api/books?status=` | `200` list, newest first | `422` unknown status |
| `POST` | `/api/books` | `201` created book | `409` duplicate (body includes `existing`), `422` |
| `PATCH` | `/api/books/{id}` | `200` updated book | `404`, `409`, `422` |
| `DELETE` | `/api/books/{id}` | `204` | `404` |

`PATCH` accepts any of `title`, `author` and `status`. Error bodies are always `{"detail": "..."}`, and every response shape is documented in the OpenAPI schema.

## Decisions

**Statuses.** `want_to_read`, `reading` and `finished`. I left out "abandoned" and "on hold": they're real, but three statuses cover the brief and adding one later is a one-line enum change.

Changing status has side effects on two dates, since "when did I start/finish this" is the only thing I'd actually want to know afterwards:
- → `reading` sets `started_at` to now and clears `finished_at`, so a re-read starts a fresh cycle.
- → `finished` sets `finished_at` to now and keeps `started_at`. If you add a book you've already finished, `started_at` stays empty rather than being made up.
- → `want_to_read` clears both.
- Setting the status a book already has does nothing, so dates aren't bumped by accident.

This rule lives on the model (`Book.new` / `Book.change_status`), so it applies the same way on create and on update and is unit-tested without HTTP or a database. A real app would want a reading *history* table (multiple reads); for now one start/finish pair is enough.

**Default sort.** Newest added first. A freshly added book should show up where you're looking, and the "want to read" pile is naturally a queue of recent additions. I didn't add sort controls; the next one I'd add is "recently finished" for the Finished tab.

**Duplicates.** The same book can't be added twice. Two books count as the same when title *and* author match after Unicode normalisation, case-folding and collapsing whitespace, so `"  dune "` / `"FRANK herbert"` matches `Dune` / `Frank Herbert`. A unique index enforces this in the database rather than just a check-then-insert, so it holds under concurrent requests. The API returns `409` together with the existing book, and the UI uses that to say *"“Dune” by Frank Herbert is already on your shelf (Reading)"* instead of a generic error.

Matching only on title + author is deliberate: it allows *Collected Poems* by two different poets, and it doesn't try to be clever about "Hobbit, The" or "Tolkien" vs "J.R.R. Tolkien". Fuzzy matching risks blocking a book the user really wants to add, which is worse than allowing a near-duplicate they can delete. Different editions of the same book are treated as one, which fits a reading list.

**Loading and errors.**
- First load shows "Loading your shelf…". If it fails, you get the error and a *Try again* button rather than an empty list that looks like "no books".
- Adding: the button is disabled and reads "Adding…" while the request runs, which prevents double submits. Validation and duplicate errors appear inline under the form, and the input is kept so nothing has to be retyped.
- Status changes are optimistic: the UI updates immediately and rolls back with a toast if the request fails. The change is small and almost always succeeds, so waiting would feel sluggish.
- Removing hides the book immediately and shows an *Undo* toast. The actual `DELETE` happens after 5 seconds, or on page close via `fetch(..., {keepalive: true})`. I prefer this to a confirm dialog: it's one click and you can still recover a misclick. If the delete fails, the book reappears with an error toast.
- Network failures and FastAPI's 422 validation errors are turned into readable messages by one small `api()` helper.
- Empty states are distinct: an empty shelf and an empty filter get different messages.

**Filtering.** The filter tabs show counts per status. The client loads the whole list once and filters locally, which makes switching tabs instant and keeps the counts accurate. The API still supports `?status=` for when the list is too large to load at once. The current filter is kept in the URL hash (`/#reading`), so it survives a reload.

**Validation.** Title and author are trimmed and must be non-empty (title ≤ 300, author ≤ 200 characters), and the status must be one of the enum values. The rules are enforced by Pydantic (unknown fields are rejected too), and the form mirrors the basic ones for faster feedback. The server is the authority, and the length limits come from the same constants as the column sizes.

**Data model.**

```
books
  id            integer PK
  title         varchar(300)
  author        varchar(200)
  dedupe_key    varchar(510) UNIQUE   -- normalised "title␟author"
  status        varchar(20)  INDEX    -- want_to_read | reading | finished
  created_at    datetime     INDEX
  updated_at    datetime
  started_at    datetime NULL
  finished_at   datetime NULL
```

The status is stored as a string with a check in the app layer (`native_enum=False`) rather than a native enum, so adding a status needs no DB-level enum migration. Timestamps go through a small `UTCDateTime` column type that rejects naive datetimes and always returns aware UTC ones, because SQLite would otherwise silently drop the timezone.

*If user accounts were added*, a "book" splits into two things: the work itself (title, author, shared across users) and a user's relationship to it (status, dates, later rating/notes). I'd move to:

```
users        (id, email, ...)
books        (id, title, author, dedupe_key UNIQUE)            -- shared catalogue
shelf_items  (id, user_id FK, book_id FK, status, created_at,
              started_at, finished_at, ...,
              UNIQUE(user_id, book_id))
```

Duplicate prevention then becomes per user (`UNIQUE(user_id, book_id)`), and every query is scoped by the authenticated user. Simply adding `user_id` to the current table and making the unique key `(user_id, dedupe_key)` would also work and is a smaller migration. The split is worth it once there's anything shared (cover images, ISBN lookups, "readers also liked"). Either way, this is the point where I'd introduce Alembic instead of `create_all`.

**Frontend approach.** Vanilla JS as native ES modules, served by FastAPI as static files, with no build step and no `node_modules`. The UI is one form, one filter row and one list; a framework would add tooling without simplifying any of that. To keep it maintainable anyway:

- **One-way data flow.** A tiny store (`store.js`) holds the state and is replaced on every update; `render()` subscribes to it. Views (`views.js`) are pure functions from state to DOM, and only `main.js` changes state.
- **Event delegation.** One listener on the list and one on the filters, dispatching on `data-action`, instead of a listener per row.
- **Typed without TypeScript.** Every file is `// @ts-check` with JSDoc types, so `tsc -p jsconfig.json` type-checks the frontend in CI and editors get autocompletion. The code that ships is the code you read.
- **Safe by construction.** All user text reaches the DOM through text nodes (`h()` in `dom.js`), never `innerHTML`, so a title like `<script>` is shown, not run.

If the app grew to several views or a lot of shared state, I'd move to Svelte or Preact rather than growing this by hand.

**What I deliberately skipped.** Ratings, notes, tags, search and an edit form. The `PATCH` endpoint already accepts `title`/`author` (with the duplicate check), but there's no edit UI yet. Search isn't worth it at reading-list sizes, where the filter tabs plus scroll are enough.

## Testing

- `tests/test_models.py`: the domain rules on their own, with a fixed clock: duplicate-key normalisation, every status transition, and the "same status is a no-op" rule.
- `tests/test_api.py`: each endpoint through HTTP against a fresh SQLite file per test: validation, duplicates (including a rename that would create one), ordering, filtering, 404s, and that the frontend is served.

I also checked the UI by hand in a browser: add, duplicate message, status change, filter tabs and URL hash, remove + undo, reload.

## What I'd do with more time

- **Frontend tests**: a few Playwright tests for the flows above, especially optimistic rollback and undo.
- **Edit UI** for title/author, since the API already supports it.
- **Notes and a 1–5 rating** on finished books: the most useful additions to a personal list.
- **Sort options** per tab (e.g. Finished by `finished_at`), and pagination or virtualisation if lists get long.
- **Alembic migrations** instead of `create_all`.
- **Docker / `docker compose up`** for a one-command start.
- **ISBN / Open Library lookup** to autocomplete title and author, which would also make duplicate detection more reliable.
- **Reading history** (a separate table) so re-reads don't overwrite the previous dates.
- **Accessibility pass**: keyboard and screen-reader testing of the toast and the status selects.
