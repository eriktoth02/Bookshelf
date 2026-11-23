from datetime import datetime, timedelta, timezone

import pytest

from app.models import Book, Status, make_dedupe_key

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
T1 = T0 + timedelta(days=7)
T2 = T1 + timedelta(days=7)


class TestDedupeKey:
    @pytest.mark.parametrize(
        ("title", "author"),
        [
            ("dune", "frank herbert"),
            ("  DUNE ", "Frank   Herbert"),
            ("Ｄｕｎｅ", "Frank Herbert"),
        ],
    )
    def test_equivalent_spellings_collide(self, title: str, author: str) -> None:
        assert make_dedupe_key(title, author) == make_dedupe_key("Dune", "Frank Herbert")

    def test_title_and_author_cannot_bleed_into_each_other(self) -> None:
        assert make_dedupe_key("a b", "c") != make_dedupe_key("a", "b c")

    def test_different_author_is_a_different_book(self) -> None:
        assert make_dedupe_key("Collected Poems", "Plath") != make_dedupe_key("Collected Poems", "Auden")


class TestStatusTransitions:
    def test_new_book_wants_to_be_read_without_dates(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.WANT_TO_READ, now=T0)
        assert (book.started_at, book.finished_at) == (None, None)

    def test_new_finished_book_has_unknown_start(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.FINISHED, now=T0)
        assert (book.started_at, book.finished_at) == (None, T0)

    def test_full_reading_cycle(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.WANT_TO_READ, now=T0)

        book.change_status(Status.READING, now=T1)
        assert (book.started_at, book.finished_at) == (T1, None)

        book.change_status(Status.FINISHED, now=T2)
        assert (book.started_at, book.finished_at) == (T1, T2)

    def test_same_status_is_a_no_op(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.READING, now=T0)
        book.change_status(Status.READING, now=T1)
        assert book.started_at == T0

    def test_reread_starts_fresh(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.FINISHED, now=T0)
        book.change_status(Status.READING, now=T1)
        assert (book.started_at, book.finished_at) == (T1, None)

    def test_back_to_pile_clears_dates(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.READING, now=T0)
        book.change_status(Status.WANT_TO_READ, now=T1)
        assert (book.started_at, book.finished_at) == (None, None)

    def test_rename_keeps_dedupe_key_in_sync(self) -> None:
        book = Book.new(title="Dune", author="Frank Herbert", status=Status.WANT_TO_READ)
        book.rename(title="Dune Messiah")
        assert book.dedupe_key == make_dedupe_key("Dune Messiah", "Frank Herbert")
