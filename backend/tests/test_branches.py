from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.errors import ProblemError
from app.models.branch import Branch
from app.modules.branches import service


@pytest.mark.asyncio
async def test_delete_branch_with_dependents_returns_conflict(monkeypatch):
    branch = Branch(
        id=uuid4(),
        tenant_id=uuid4(),
        name="North",
        code="NORTH",
        is_active=True,
        created_at=datetime.now(UTC),
    )

    async def get_branch(*args, **kwargs):
        return branch

    async def blocked_delete(*args, **kwargs):
        raise IntegrityError("DELETE", {}, Exception("fk_employees_branch"))

    monkeypatch.setattr(service.branch_repo, "get_branch_by_id", get_branch)
    monkeypatch.setattr(service.branch_repo, "delete_branch_record", blocked_delete)

    with pytest.raises(ProblemError) as exc:
        await service.delete_branch(None, branch.tenant_id, branch.id)

    assert exc.value.status == 409
    assert exc.value.title == "Branch in use"
