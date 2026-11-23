import enum
import re
import unicodedata
from datetime import datetime, timezone

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, UTCDateTime

TITLE_MAX_LENGTH = 300
AUTHOR_MAX_LENGTH = 200

_WHITESPACE = re.compile(r"\s+")
_KEY_SEPARATOR = "\x1f"


class Status(str, enum.Enum):
    WANT_TO_READ = "want_to_read"
    READING = "reading"
    FINISHED = "finished"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalise(text: str) -> str:
    return _WHITESPACE.sub(" ", unicodedata.normalize("NFKC", text).casefold()).strip()


def make_dedupe_key(title: str, author: str) -> str:
    return f"{_normalise(title)}{_KEY_SEPARATOR}{_normalise(author)}"


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH))
    author: Mapped[str] = mapped_column(String(AUTHOR_MAX_LENGTH))
    dedupe_key: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH + AUTHOR_MAX_LENGTH + 1), unique=True)
    status: Mapped[Status] = mapped_column(
        Enum(Status, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e]),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)

    @classmethod
    def new(cls, *, title: str, author: str, status: Status, now: datetime | None = None) -> "Book":
        book = cls()
        book.rename(title=title, author=author)
        book._enter_status(status, now or utcnow())
        return book

    def rename(self, *, title: str | None = None, author: str | None = None) -> None:
        if title is not None:
            self.title = title
        if author is not None:
            self.author = author
        self.dedupe_key = make_dedupe_key(self.title, self.author)

    def change_status(self, status: Status, now: datetime | None = None) -> None:
        if status is not self.status:
            self._enter_status(status, now or utcnow())

    def _enter_status(self, status: Status, now: datetime) -> None:
        match status:
            case Status.READING:
                self.started_at, self.finished_at = now, None
            case Status.FINISHED:
                self.finished_at = now
            case Status.WANT_TO_READ:
                self.started_at = self.finished_at = None
        self.status = status
