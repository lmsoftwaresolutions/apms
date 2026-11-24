from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.modules.muster.service import export_muster

router = APIRouter(prefix="/muster", tags=["muster"])


@router.get("")
async def muster(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("muster.export.read"))],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
    branch_id: Annotated[UUID | None, Query()] = None,
) -> list[dict[str, object]]:
    return await export_muster(session, current.tenant_id, start_date, end_date, branch_id)
