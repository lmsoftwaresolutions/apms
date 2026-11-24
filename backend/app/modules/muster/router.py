import calendar
import io
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.modules.muster.export.service import export_muster_file
from app.modules.muster.service import export_muster, fetch_muster

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


@router.get("/lines")
async def muster_lines(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("muster.export.read"))],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    branch_id: Annotated[UUID | None, Query()] = None,
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    department_id: Annotated[UUID | None, Query()] = None,
) -> list[dict[str, object]]:
    if year is not None and month is not None:
        num_days = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, num_days)

    if start_date is not None and end_date is not None:
        return await export_muster(session, current.tenant_id, start_date, end_date, branch_id)

    today = date.today()
    num_days = calendar.monthrange(today.year, today.month)[1]
    return await export_muster(
        session, current.tenant_id, date(today.year, today.month, 1), date(today.year, today.month, num_days), branch_id
    )


@router.get("/export")
async def export_muster_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("muster.export.read"))],
    year: Annotated[int, Query(ge=1900, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
    format: Annotated[Literal["xlsx", "csv", "pdf"], Query()] = "xlsx",
    department_id: Annotated[UUID | None, Query()] = None,
    template: Annotated[Literal["standard", "form_25", "form_ii", "form_t"], Query()] = "standard",
) -> StreamingResponse:
    content, media_type, filename = await export_muster_file(
        session=session,
        tenant_id=current.tenant_id,
        year=year,
        month=month,
        export_format=format,
        department_id=department_id,
        template=template,
    )

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }

    if isinstance(content, io.BytesIO):
        content.seek(0)
        return StreamingResponse(content, media_type=media_type, headers=headers)

    return StreamingResponse(content, media_type=media_type, headers=headers)
