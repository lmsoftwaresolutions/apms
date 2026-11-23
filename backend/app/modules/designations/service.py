from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.designation import Designation
from app.modules.departments import repository as dept_repo
from app.modules.designations import repository as desig_repo
from app.modules.employees import repository as emp_repo
from app.modules.designations.schemas import (
    DesignationCreate,
    DesignationOut,
    DesignationUpdate,
)


def designation_to_out(desig: Designation) -> DesignationOut:
    return DesignationOut(
        id=desig.id,
        department_id=desig.department_id,
        code=desig.code,
        name=desig.name,
        description=desig.description,
        is_active=desig.is_active,
        created_at=desig.created_at,
        updated_at=desig.updated_at,
    )


async def list_designations(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID | None = None,
) -> list[DesignationOut]:
    rows = await desig_repo.list_designations_by_tenant(session, tenant_id, department_id)
    return [designation_to_out(row) for row in rows]


async def create_designation(
    session: AsyncSession,
    tenant_id: UUID,
    payload: DesignationCreate,
) -> DesignationOut:
    dept = await dept_repo.get_department_by_id(session, tenant_id, payload.department_id)
    if dept is None:
        raise ProblemError(400, "Invalid department", "Department does not exist in this tenant.")

    code = payload.code.strip().upper()
    name = payload.name.strip()

    existing_code = await desig_repo.get_designation_by_code(session, tenant_id, payload.department_id, code)
    if existing_code is not None:
        raise ProblemError(
            409,
            "Designation code already exists",
            f"A designation with code '{code}' already exists in this department.",
        )

    existing_name = await desig_repo.get_designation_by_name(session, tenant_id, payload.department_id, name)
    if existing_name is not None:
        raise ProblemError(
            409,
            "Designation name already exists",
            f"A designation with name '{name}' already exists in this department.",
        )

    now = datetime.now(UTC)
    designation = Designation(
        id=uuid4(),
        tenant_id=tenant_id,
        department_id=payload.department_id,
        code=code,
        name=name,
        description=payload.description.strip() if payload.description else None,
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    try:
        saved = await desig_repo.insert_designation(session, designation)
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Designation already exists",
            "A designation with this code or name already exists in this department.",
        ) from exc

    return designation_to_out(saved)


async def update_designation(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
    payload: DesignationUpdate,
) -> DesignationOut:
    designation = await desig_repo.get_designation_by_id(session, tenant_id, designation_id)
    if designation is None:
        raise ProblemError(404, "Designation not found", "No designation with that id exists in this tenant.")

    if payload.code is not None:
        new_code = payload.code.strip().upper()
        if new_code != designation.code:
            existing = await desig_repo.get_designation_by_code(
                session, tenant_id, designation.department_id, new_code
            )
            if existing is not None and existing.id != designation_id:
                raise ProblemError(
                    409,
                    "Designation code already exists",
                    f"A designation with code '{new_code}' already exists in this department.",
                )

    if payload.name is not None:
        new_name = payload.name.strip()
        if new_name.lower() != designation.name.lower():
            existing = await desig_repo.get_designation_by_name(
                session, tenant_id, designation.department_id, new_name
            )
            if existing is not None and existing.id != designation_id:
                raise ProblemError(
                    409,
                    "Designation name already exists",
                    f"A designation with name '{new_name}' already exists in this department.",
                )

    update_description = "description" in payload.model_fields_set
    previous_name = designation.name

    try:
        updated = await desig_repo.update_designation_fields(
            session,
            designation,
            name=payload.name,
            code=payload.code,
            description=payload.description.strip() if payload.description else payload.description,
            update_description=update_description,
            is_active=payload.is_active,
        )
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Designation already exists",
            "A designation with this code or name already exists in this department.",
        ) from exc

    if updated.name != previous_name:
        await emp_repo.sync_designation_label(session, tenant_id, designation_id, updated.name)

    return designation_to_out(updated)


async def delete_designation(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
) -> None:
    designation = await desig_repo.get_designation_by_id(session, tenant_id, designation_id)
    if designation is None:
        raise ProblemError(404, "Designation not found", "No designation with that id exists in this tenant.")

    employee_count = await emp_repo.count_employees_with_designation(session, tenant_id, designation_id)
    if employee_count > 0:
        raise ProblemError(
            409,
            "Designation in use",
            f"Cannot delete designation because it is assigned to {employee_count} employee(s). "
            "Reassign the employees or deactivate the designation instead.",
        )

    try:
        await desig_repo.delete_designation_record(session, designation)
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Designation in use",
            "Cannot delete designation because it is currently referenced by other records.",
        ) from exc

