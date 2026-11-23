from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_pii
from app.core.errors import ProblemError
from app.modules.employees import repository as emp_repo
from app.modules.privacy.repository import insert_pii_audit

UNMASK_FIELDS = {
    "pan": "pan_encrypted",
    "aadhaar": "aadhaar_encrypted",
    "bank_account": "bank_account_encrypted",
    "bank_ifsc": "bank_ifsc_encrypted",
    "epf_uan": "epf_uan_encrypted",
    "esic_number": "esic_number_encrypted",
}


def consent_action(previous_granted: bool, requested: bool | None) -> str | None:
    """Return GRANTED or WITHDRAWN only when the effective consent changes."""
    if requested is True and not previous_granted:
        return "GRANTED"
    if requested is False and previous_granted:
        return "WITHDRAWN"
    return None


async def unmask_employee(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    actor_user_id: UUID,
    fields: list[str],
) -> dict[str, str | None]:
    unknown = [name for name in fields if name not in UNMASK_FIELDS]
    if unknown:
        raise ProblemError(422, "Unknown identifier", f"Cannot unmask {', '.join(unknown)}.")
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
    context = str(tenant_id)
    revealed: dict[str, str | None] = {}
    for name in fields:
        await insert_pii_audit(session, tenant_id, employee_id, actor_user_id, name)
        revealed[name] = decrypt_pii(getattr(emp, UNMASK_FIELDS[name]), context=context)
    return revealed
