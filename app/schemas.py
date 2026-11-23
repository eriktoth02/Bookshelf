from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .models import AUTHOR_MAX_LENGTH, TITLE_MAX_LENGTH, Status

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH)]
Author = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=AUTHOR_MAX_LENGTH)]


class BookCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    author: Author
    status: Status = Status.WANT_TO_READ


class BookUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    author: Author | None = None
    status: Status | None = None


class BookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    author: str
    status: Status
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ErrorResponse(BaseModel):
    detail: str


class DuplicateBookResponse(ErrorResponse):
    existing: BookRead = Field(description="The book already on the shelf.")
