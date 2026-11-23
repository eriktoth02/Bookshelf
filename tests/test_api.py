from typing import Any

import pytest
from fastapi.testclient import TestClient

from .conftest import AddBook


def titles(client: TestClient, query: str = "") -> list[str]:
    return [book["title"] for book in client.get(f"/api/books{query}").json()]


class TestCreate:
    def test_returns_created_book_with_defaults(self, add_book: AddBook) -> None:
        response = add_book("  Dune  ", " Frank Herbert ")

        assert response.status_code == 201
        book = response.json()
        assert book["title"] == "Dune"
        assert book["author"] == "Frank Herbert"
        assert book["status"] == "want_to_read"
        assert book["created_at"].endswith(("Z", "+00:00"))

    @pytest.mark.parametrize(
        "payload",
        [
            {"title": "", "author": "X"},
            {"title": "   ", "author": "X"},
            {"title": "X"},
            {"title": "X" * 301, "author": "Y"},
            {"title": "X", "author": "Y", "status": "abandoned"},
            {"title": "X", "author": "Y", "rating": 5},
        ],
    )
    def test_rejects_invalid_input(self, client: TestClient, payload: dict[str, Any]) -> None:
        assert client.post("/api/books", json=payload).status_code == 422

    def test_rejects_duplicate_and_returns_existing(self, client: TestClient, add_book: AddBook) -> None:
        original = add_book().json()

        response = add_book("  dune ", "FRANK   herbert")

        assert response.status_code == 409
        assert response.json()["existing"]["id"] == original["id"]
        assert titles(client) == ["Dune"]


class TestList:
    def test_newest_first(self, client: TestClient, add_book: AddBook) -> None:
        add_book("A", "X")
        add_book("B", "Y")
        assert titles(client) == ["B", "A"]

    def test_filter_by_status(self, client: TestClient, add_book: AddBook) -> None:
        add_book("A", "X")
        add_book("B", "Y", status="reading")

        assert titles(client, "?status=reading") == ["B"]
        assert titles(client, "?status=want_to_read") == ["A"]
        assert client.get("/api/books?status=nope").status_code == 422


class TestUpdate:
    def test_status_change_records_dates(self, client: TestClient, add_book: AddBook) -> None:
        book_id = add_book().json()["id"]

        reading = client.patch(f"/api/books/{book_id}", json={"status": "reading"}).json()
        finished = client.patch(f"/api/books/{book_id}", json={"status": "finished"}).json()

        assert reading["started_at"] is not None
        assert finished["started_at"] == reading["started_at"]
        assert finished["finished_at"] is not None

    def test_rename_into_duplicate_is_rejected(self, client: TestClient, add_book: AddBook) -> None:
        add_book("A", "X")
        book_id = add_book("B", "X").json()["id"]

        response = client.patch(f"/api/books/{book_id}", json={"title": "a"})

        assert response.status_code == 409
        assert titles(client) == ["B", "A"]

    def test_unknown_book(self, client: TestClient) -> None:
        response = client.patch("/api/books/999", json={"status": "reading"})
        assert response.status_code == 404
        assert response.json() == {"detail": "Book not found."}


class TestDelete:
    def test_removes_book(self, client: TestClient, add_book: AddBook) -> None:
        book_id = add_book().json()["id"]

        assert client.delete(f"/api/books/{book_id}").status_code == 204
        assert titles(client) == []
        assert client.delete(f"/api/books/{book_id}").status_code == 404


def test_frontend_is_served(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "<title>Bookshelf</title>" in response.text
