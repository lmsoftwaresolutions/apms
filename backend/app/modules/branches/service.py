from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.branch import Branch
from app.modules.branches import repository as branch_repo
from app.modules.branches.schemas import BranchCreate, BranchOut, BranchUpdate


def branch_to_out(branch: Branch) -> BranchOut:
    return BranchOut(
        id=branch.id,
        name=branch.name,
        code=branch.code,
        registration_number=branch.registration_number,
        geofence_latitude=branch.geofence_latitude,
        geofence_longitude=branch.geofence_longitude,
        geofence_radius_m=branch.geofence_radius_m,
        allowed_bssids=branch.allowed_bssids,
        is_active=branch.is_active,
    )


async def list_branches(session: AsyncSession, tenant_id: UUID) -> list[BranchOut]:
    rows = await branch_repo.list_branches_by_tenant(session, tenant_id)
    return [branch_to_out(row) for row in rows]


async def create_branch(session: AsyncSession, tenant_id: UUID, payload: BranchCreate) -> BranchOut:
    branch = Branch(
        id=uuid4(),
        tenant_id=tenant_id,
        name=payload.name,
        code=payload.code,
        registration_number=payload.registration_number,
        geofence_latitude=payload.geofence_latitude,
        geofence_longitude=payload.geofence_longitude,
        geofence_radius_m=payload.geofence_radius_m,
        allowed_bssids=payload.allowed_bssids,
        is_active=True,
        created_at=datetime.now(UTC),
    )
    try:
        saved = await branch_repo.insert_branch(session, branch)
    except IntegrityError as exc:
        raise ProblemError(409, "Branch already exists", "A branch with this code already exists.") from exc
    return branch_to_out(saved)


async def update_branch(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID,
    payload: BranchUpdate,
) -> BranchOut:
    branch = await branch_repo.get_branch_by_id(session, tenant_id, branch_id)
    if branch is None:
        raise ProblemError(404, "Branch not found", "No branch with that id exists in this tenant.")

    try:
        updated = await branch_repo.update_branch_fields(
            session,
            branch,
            name=payload.name,
            code=payload.code,
            is_active=payload.is_active,
            registration_number=payload.registration_number,
            update_registration="registration_number" in payload.model_fields_set,
            geofence_latitude=payload.geofence_latitude,
            geofence_longitude=payload.geofence_longitude,
            geofence_radius_m=payload.geofence_radius_m,
            allowed_bssids=payload.allowed_bssids,
            update_geofence_fields=payload.model_fields_set,
        )
    except IntegrityError as exc:
        raise ProblemError(409, "Branch already exists", "A branch with this code already exists.") from exc

    return branch_to_out(updated)


async def delete_branch(session: AsyncSession, tenant_id: UUID, branch_id: UUID) -> None:
    branch = await branch_repo.get_branch_by_id(session, tenant_id, branch_id)
    if branch is None:
        raise ProblemError(404, "Branch not found", "No branch with that id exists in this tenant.")
    try:
        await branch_repo.delete_branch_record(session, branch)
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Branch in use",
            "This branch still has employees or other records. Deactivate it instead of deleting it.",
        ) from exc
