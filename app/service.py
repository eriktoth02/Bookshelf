from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .errors import BookNotFoundError, DuplicateBookError
from .models import Book, Status
from .schemas import BookCreate, BookUpdate


class BookService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self, status: Status | None = None) -> Sequence[Book]:
        query = select(Book).order_by(Book.created_at.desc(), Book.id.desc())
        if status is not None:
            query = query.where(Book.status == status)
        return self._session.scalars(query).all()

    def get(self, book_id: int) -> Book:
        book = self._session.get(Book, book_id)
        if book is None:
            raise BookNotFoundError(book_id)
        return book

    def create(self, data: BookCreate) -> Book:
        book = Book.new(title=data.title, author=data.author, status=data.status)
        self._session.add(book)
        self._commit_or_raise_duplicate(book.dedupe_key)
        return book

    def update(self, book_id: int, data: BookUpdate) -> Book:
        book = self.get(book_id)
        if data.title is not None or data.author is not None:
            book.rename(title=data.title, author=data.author)
        if data.status is not None:
            book.change_status(data.status)
        self._commit_or_raise_duplicate(book.dedupe_key)
        return book

    def delete(self, book_id: int) -> None:
        self._session.delete(self.get(book_id))
        self._session.commit()

    def _commit_or_raise_duplicate(self, dedupe_key: str) -> None:
        try:
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            existing = self._session.scalar(select(Book).where(Book.dedupe_key == dedupe_key))
            if existing is None:
                raise
            raise DuplicateBookError(existing) from None
