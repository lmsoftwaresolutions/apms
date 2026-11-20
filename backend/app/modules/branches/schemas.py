from uuid import UUID

from pydantic import BaseModel, Field


class BranchOut(BaseModel):
    id: UUID
    name: str
    code: str
    is_active: bool


class BranchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    is_active: bool | None = None


class DeletedOut(BaseModel):
    id: UUID
    deleted: bool = True
