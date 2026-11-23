from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from .models import Book
from .schemas import BookRead, DuplicateBookResponse, ErrorResponse


class BookNotFoundError(Exception):
    def __init__(self, book_id: int) -> None:
        super().__init__(f"Book {book_id} not found.")
        self.book_id = book_id


class DuplicateBookError(Exception):
    def __init__(self, existing: Book) -> None:
        super().__init__("This book is already on your shelf.")
        self.existing = existing


async def _not_found(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, BookNotFoundError)
    body = ErrorResponse(detail="Book not found.")
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=body.model_dump(mode="json"))


async def _duplicate(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DuplicateBookError)
    body = DuplicateBookResponse(detail=str(exc), existing=BookRead.model_validate(exc.existing))
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body.model_dump(mode="json"))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(BookNotFoundError, _not_found)
    app.add_exception_handler(DuplicateBookError, _duplicate)
