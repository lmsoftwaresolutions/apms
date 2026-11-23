from uuid import UUID

from pydantic import BaseModel


class DeletedOut(BaseModel):
    id: UUID
    deleted: bool = True
