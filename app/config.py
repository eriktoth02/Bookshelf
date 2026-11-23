import os
from dataclasses import dataclass

DEFAULT_DATABASE_URL = "sqlite:///./bookshelf.db"


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str = DEFAULT_DATABASE_URL

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(database_url=os.getenv("BOOKSHELF_DATABASE_URL", DEFAULT_DATABASE_URL))
