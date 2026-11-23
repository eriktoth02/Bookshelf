from collections.abc import Iterator, Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from .models import Book, Status
from .schemas import BookCreate, BookRead, BookUpdate, DuplicateBookResponse, ErrorResponse
from .service import BookService


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


def get_book_service(session: Annotated[Session, Depends(get_session)]) -> BookService:
    return BookService(session)


Books = Annotated[BookService, Depends(get_book_service)]

NOT_FOUND: dict[int | str, dict[str, Any]] = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
DUPLICATE: dict[int | str, dict[str, Any]] = {status.HTTP_409_CONFLICT: {"model": DuplicateBookResponse}}

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("", response_model=list[BookRead])
def list_books(books: Books, status: Status | None = None) -> Sequence[Book]:
    return books.list(status)


@router.post("", response_model=BookRead, status_code=status.HTTP_201_CREATED, responses=DUPLICATE)
def create_book(data: BookCreate, books: Books) -> Book:
    return books.create(data)


@router.patch("/{book_id}", response_model=BookRead, responses={**NOT_FOUND, **DUPLICATE})
def update_book(book_id: int, data: BookUpdate, books: Books) -> Book:
    return books.update(book_id, data)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_book(book_id: int, books: Books) -> Response:
    books.delete(book_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
