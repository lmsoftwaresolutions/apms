from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.department import Department
from app.modules.branches import repository as branch_repo
from app.modules.departments import repository as dept_repo
from app.modules.departments.schemas import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)


MAX_DEPT_DEPTH = 50


def department_to_out(dept: Department) -> DepartmentOut:
    return DepartmentOut(
        id=dept.id,
        branch_id=dept.branch_id,
        name=dept.name,
        code=dept.code,
        parent_dept_id=dept.parent_dept_id,
        is_active=dept.is_active,
    )


async def list_departments(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID | None = None,
) -> list[DepartmentOut]:
    rows = await dept_repo.list_departments_by_tenant(session, tenant_id, branch_id)
    return [department_to_out(row) for row in rows]


async def create_department(
    session: AsyncSession,
    tenant_id: UUID,
    payload: DepartmentCreate,
) -> DepartmentOut:
    if await branch_repo.get_branch_by_id(session, tenant_id, payload.branch_id) is None:
        raise ProblemError(400, "Invalid branch", "Branch does not exist in this tenant.")

    if payload.parent_dept_id is not None:
        parent = await dept_repo.get_department_by_id(session, tenant_id, payload.parent_dept_id)
        if parent is None:
            raise ProblemError(400, "Invalid parent department", "Parent department does not exist in this tenant.")
        if parent.branch_id != payload.branch_id:
            raise ProblemError(400, "Invalid parent department", "Parent department must belong to the same branch.")

    department = Department(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        name=payload.name,
        code=payload.code,
        parent_dept_id=payload.parent_dept_id,
        is_active=True,
        created_at=datetime.now(UTC),
    )
    try:
        saved = await dept_repo.insert_department(session, department)
    except IntegrityError as exc:
        raise ProblemError(
            409, "Department already exists", "A department with this code already exists in this branch."
        ) from exc
    return department_to_out(saved)


async def update_department(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
    payload: DepartmentUpdate,
) -> DepartmentOut:
    department = await dept_repo.get_department_by_id(session, tenant_id, department_id)
    if department is None:
        raise ProblemError(404, "Department not found", "No department with that id exists in this tenant.")

    target_branch_id = payload.branch_id if payload.branch_id is not None else department.branch_id
    if payload.branch_id is not None:
        if await branch_repo.get_branch_by_id(session, tenant_id, payload.branch_id) is None:
            raise ProblemError(400, "Invalid branch", "Branch does not exist in this tenant.")
        if payload.branch_id != department.branch_id:
            if await dept_repo.has_sub_departments(session, tenant_id, department_id):
                raise ProblemError(
                    409,
                    "Department has sub-departments",
                    "Cannot move a department with sub-departments to a different branch. "
                    "Move or re-parent its children first.",
                )

    update_parent = "parent_dept_id" in payload.model_fields_set
    new_parent_id = payload.parent_dept_id if update_parent else department.parent_dept_id

    if update_parent and payload.parent_dept_id is None:
        pass
    elif new_parent_id is not None:
        parent = await dept_repo.get_department_by_id(session, tenant_id, new_parent_id)
        if parent is None:
            raise ProblemError(400, "Invalid parent department", "Parent department does not exist in this tenant.")
        if parent.branch_id != target_branch_id:
            raise ProblemError(400, "Invalid parent department", "Parent department must belong to the same branch.")

        # Cycle detection: traverse parent hierarchy
        curr = parent
        visited: set[UUID] = set()
        depth = 0
        while curr is not None and depth < MAX_DEPT_DEPTH:
            if curr.id == department_id:
                raise ProblemError(400, "Cyclic department hierarchy", "A department cannot be a descendant of itself.")
            if curr.parent_dept_id is None or curr.id in visited:
                break
            visited.add(curr.id)
            depth += 1
            curr = await dept_repo.get_department_by_id(session, tenant_id, curr.parent_dept_id)
        else:
            if curr is not None:
                raise ProblemError(
                    400,
                    "Department hierarchy too deep",
                    "Parent chain exceeds the maximum depth.",
                )

    try:
        updated = await dept_repo.update_department_fields(
            session,
            department,
            branch_id=payload.branch_id,
            name=payload.name,
            code=payload.code,
            parent_dept_id=payload.parent_dept_id,
            update_parent_dept_id=update_parent,
            is_active=payload.is_active,
        )
    except IntegrityError as exc:
        raise ProblemError(
            409, "Department already exists", "A department with this code already exists in this branch."
        ) from exc

    return department_to_out(updated)


async def delete_department(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
) -> None:
    department = await dept_repo.get_department_by_id(session, tenant_id, department_id)
    if department is None:
        raise ProblemError(404, "Department not found", "No department with that id exists in this tenant.")

    if await dept_repo.has_sub_departments(session, tenant_id, department_id):
        raise ProblemError(
            409, "Department has sub-departments", "Cannot delete a department that has sub-departments."
        )

    try:
        await dept_repo.delete_department_record(session, department)
    except IntegrityError as exc:
        raise ProblemError(
            409, "Department has sub-departments", "Cannot delete a department that has sub-departments."
        ) from exc

