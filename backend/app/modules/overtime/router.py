from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.overtime.repository import (
    get_overtime_record,
    get_quarterly_approved_ot_minutes,
    get_statutory_ot_cap,
    list_overtime_records,
)
from app.modules.overtime.schemas import (
    OvertimeApproveRequest,
    OvertimeConvertCompOffRequest,
    OvertimeRecordOut,
    OvertimeRejectRequest,
)
from app.modules.overtime.service import (
    approve_overtime,
    convert_to_compoff,
    reject_overtime,
)

router = APIRouter(prefix="/attendance/overtime", tags=["overtime"])


@router.get("/pending", response_model=list[OvertimeRecordOut])
async def list_pending_overtime(
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:read", "overtime.record.read")),
    ],
    employee_id: Annotated[UUID | None, Query()] = None,
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> list[OvertimeRecordOut]:
    rows = await list_overtime_records(
        session,
        current.tenant_id,
        employee_id=employee_id,
        status="UNREVIEWED",
        start_date=start_date,
        end_date=end_date,
    )
    return [OvertimeRecordOut.model_validate(r) for r in rows]


@router.get("", response_model=list[OvertimeRecordOut])
@router.get("/", response_model=list[OvertimeRecordOut], include_in_schema=False)
async def list_all_overtime(
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:read", "overtime.record.read")),
    ],
    employee_id: Annotated[UUID | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> list[OvertimeRecordOut]:
    rows = await list_overtime_records(
        session,
        current.tenant_id,
        employee_id=employee_id,
        status=status_filter,
        start_date=start_date,
        end_date=end_date,
    )
    return [OvertimeRecordOut.model_validate(r) for r in rows]


@router.get("/{overtime_id}", response_model=OvertimeRecordOut)
async def get_overtime_detail(
    overtime_id: UUID,
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:read", "overtime.record.read")),
    ],
) -> OvertimeRecordOut:
    rec = await get_overtime_record(session, current.tenant_id, overtime_id)
    if rec is None:
        raise ProblemError(404, "Overtime record not found", "Overtime record not found in this tenant.")

    quarter = (rec.overtime_date.month - 1) // 3 + 1
    used_mins = await get_quarterly_approved_ot_minutes(
        session, current.tenant_id, rec.employee_id, rec.overtime_date.year, quarter
    )
    cap = await get_statutory_ot_cap(session, state_code="DEFAULT", as_of=rec.overtime_date)
    cap_mins = (cap.quarterly_cap_hours * 60) if cap else 125 * 60

    out = OvertimeRecordOut.model_validate(rec)
    out.quarterly_ot_minutes_used = used_mins
    out.quarterly_ot_cap_minutes = cap_mins
    return out


@router.post("/{overtime_id}/approve", response_model=OvertimeRecordOut)
async def approve_overtime_endpoint(
    overtime_id: UUID,
    payload: OvertimeApproveRequest,
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:update", "overtime.record.update")),
    ],
) -> OvertimeRecordOut:
    rec = await approve_overtime(
        session,
        current.tenant_id,
        overtime_id,
        approved_minutes=payload.approved_minutes,
        supervisor_id=current.user.id,
        decision_reason=payload.decision_reason,
    )
    return OvertimeRecordOut.model_validate(rec)


@router.post("/{overtime_id}/convert-compoff", response_model=OvertimeRecordOut)
async def convert_compoff_endpoint(
    overtime_id: UUID,
    payload: OvertimeConvertCompOffRequest,
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:update", "overtime.record.update")),
    ],
) -> OvertimeRecordOut:
    rec = await convert_to_compoff(
        session,
        current.tenant_id,
        overtime_id,
        supervisor_id=current.user.id,
        decision_reason=payload.decision_reason,
    )
    return OvertimeRecordOut.model_validate(rec)


@router.post("/{overtime_id}/reject", response_model=OvertimeRecordOut)
async def reject_overtime_endpoint(
    overtime_id: UUID,
    payload: OvertimeRejectRequest,
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:update", "overtime.record.update")),
    ],
) -> OvertimeRecordOut:
    rec = await reject_overtime(
        session,
        current.tenant_id,
        overtime_id,
        supervisor_id=current.user.id,
        decision_reason=payload.decision_reason,
    )
    return OvertimeRecordOut.model_validate(rec)
