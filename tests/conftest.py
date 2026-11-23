from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any, Protocol

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class JsonResponse(Protocol):
    @property
    def status_code(self) -> int: ...

    def json(self) -> Any: ...


AddBook = Callable[..., JsonResponse]


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}"))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def add_book(client: TestClient) -> AddBook:
    def add(title: str = "Dune", author: str = "Frank Herbert", **extra: Any) -> JsonResponse:
        response: JsonResponse = client.post("/api/books", json={"title": title, "author": author, **extra})
        return response

    return add
