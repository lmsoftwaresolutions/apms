from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.deps import require_permission
from app.api.v1.endpoints.auth import IdempotencyDep
from app.core.database import SessionLocal
from app.core.errors import ProblemError
from app.schemas.iam import (
    AssignmentIn,
    DeletedOut,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserOut,
)
from app.services.directory import (
    assign_role,
    create_role,
    delete_role,
    list_roles,
    list_users,
    unassign_role,
    update_role,
)
from app.services.idempotency import replay_or_reserve, store_response
from sqlalchemy import select

from app.models.iam import Permission

router = APIRouter(tags=["iam"])


@router.get("/permissions", response_model=list[PermissionOut], summary="Permission catalog")
async def permissions(current=Depends(require_permission("iam.role.read"))) -> list[PermissionOut]:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        rows = (await session.scalars(select(Permission).order_by(Permission.code))).all()
        return [
            PermissionOut(code=row.code, module=row.module, resource=row.resource, action=row.action, description=row.description)
            for row in rows
        ]


@router.get("/roles", response_model=list[RoleOut], summary="List roles")
async def roles(current=Depends(require_permission("iam.role.read"))) -> list[RoleOut]:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        data = await list_roles(session, current.tenant_id)
        await session.commit()
        return data


@router.post("/roles", response_model=RoleOut, status_code=201, summary="Create a role")
async def create(
    payload: RoleCreate,
    response: Response,
    current=Depends(require_permission("iam.role.create")),
    idempotency_key: IdempotencyDep = None,
) -> RoleOut:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        replay = await replay_or_reserve(session, current.tenant_id, idempotency_key, "/api/v1/roles", payload.model_dump())
        if replay:
            response.status_code = int(replay["status_code"])
            return RoleOut.model_validate(replay["body"])
        created = await create_role(session, current.tenant_id, payload)
        body = created.model_dump(mode="json")
        await store_response(session, current.tenant_id, idempotency_key, "/api/v1/roles", payload.model_dump(), 201, body)
        await session.commit()
        return created


@router.patch("/roles/{role_id}", response_model=RoleOut, summary="Rename a role or replace its permissions")
async def update(role_id: UUID, payload: RoleUpdate, current=Depends(require_permission("iam.role.update"))) -> RoleOut:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        updated = await update_role(session, current.tenant_id, role_id, payload)
        await session.commit()
        return updated


@router.delete("/roles/{role_id}", response_model=DeletedOut, summary="Delete a custom role")
async def remove(role_id: UUID, current=Depends(require_permission("iam.role.delete"))) -> DeletedOut:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        await delete_role(session, current.tenant_id, role_id)
        await session.commit()
        return DeletedOut(id=role_id)


@router.get("/users", response_model=list[UserOut], summary="List users and their role codes")
async def users(current=Depends(require_permission("iam.assignment.read"))) -> list[UserOut]:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        data = await list_users(session, current.tenant_id)
        await session.commit()
        return data


@router.post("/users/{user_id}/roles", response_model=UserOut, status_code=201, summary="Assign a role")
async def assign(user_id: UUID, payload: AssignmentIn, current=Depends(require_permission("iam.assignment.create"))) -> UserOut:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        updated = await assign_role(session, current.tenant_id, user_id, payload.role_id)
        await session.commit()
        return updated


@router.delete("/users/{user_id}/roles/{role_id}", response_model=DeletedOut, summary="Remove a role assignment")
async def unassign(
    user_id: UUID,
    role_id: UUID,
    current=Depends(require_permission("iam.assignment.delete")),
) -> DeletedOut:
    async with SessionLocal() as session:
        from app.core.database import set_tenant

        await set_tenant(session, current.tenant_id)
        await unassign_role(session, current.tenant_id, user_id, role_id)
        await session.commit()
        return DeletedOut(id=role_id)


_ = ProblemError
