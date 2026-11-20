from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import (
    decrypt_pii,
    encrypt_pii,
    mask_aadhaar,
    mask_bank_account,
    mask_bank_ifsc,
    mask_pan,
)
from app.core.errors import ProblemError
from app.models.employee import Employee
from app.modules.employees import repository as emp_repo
from app.modules.employees.schemas import EmployeeCreate, EmployeeOut, EmployeeUpdate


def employee_to_out(emp: Employee) -> EmployeeOut:
    """Transform an Employee ORM model into an EmployeeOut schema with masked PII."""
    context = str(emp.tenant_id)
    raw_pan = decrypt_pii(emp.pan_encrypted, context=context)
    raw_aadhaar = decrypt_pii(emp.aadhaar_encrypted, context=context)
    raw_bank_account = decrypt_pii(emp.bank_account_encrypted, context=context)
    raw_bank_ifsc = decrypt_pii(emp.bank_ifsc_encrypted, context=context)

    return EmployeeOut(
        id=emp.id,
        tenant_id=emp.tenant_id,
        user_id=emp.user_id,
        branch_id=emp.branch_id,
        department_id=emp.department_id,
        employee_code=emp.employee_code,
        full_name=emp.full_name,
        designation=emp.designation,
        date_of_joining=emp.date_of_joining,
        date_of_birth=emp.date_of_birth,
        employment_type=emp.employment_type,
        probation_end_date=emp.probation_end_date,
        confirmation_date=emp.confirmation_date,
        pan_masked=mask_pan(raw_pan),
        aadhaar_masked=mask_aadhaar(raw_aadhaar),
        bank_account_masked=mask_bank_account(raw_bank_account),
        bank_ifsc_masked=mask_bank_ifsc(raw_bank_ifsc),
        epf_uan=emp.epf_uan,
        esic_number=emp.esic_number,
        is_active=emp.is_active,
        biometric_consent_at=emp.biometric_consent_at,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


async def create_employee(session: AsyncSession, tenant_id: UUID, payload: EmployeeCreate) -> EmployeeOut:
    # Verify branch belongs to tenant
    branch = await emp_repo.get_branch(session, tenant_id, payload.branch_id)
    if branch is None:
        raise ProblemError(400, "Invalid branch", "Branch does not exist in this tenant.")

    # Verify department if provided
    if payload.department_id is not None:
        dept = await emp_repo.get_department(session, tenant_id, payload.department_id)
        if dept is None:
            raise ProblemError(400, "Invalid department", "Department does not exist in this tenant.")

    # Verify user link if provided
    if payload.user_id is not None:
        user = await emp_repo.get_user(session, tenant_id, payload.user_id)
        if user is None:
            raise ProblemError(400, "Invalid user", "User does not exist in this tenant.")

    context = str(tenant_id)
    now = datetime.now(UTC)

    emp = Employee(
        id=uuid4(),
        tenant_id=tenant_id,
        user_id=payload.user_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        employee_code=payload.employee_code.strip(),
        full_name=payload.full_name.strip(),
        designation=payload.designation.strip() if payload.designation else None,
        date_of_joining=payload.date_of_joining,
        date_of_birth=payload.date_of_birth,
        employment_type=payload.employment_type,
        probation_end_date=payload.probation_end_date,
        confirmation_date=payload.confirmation_date,
        # Field-level envelope encryption
        pan_encrypted=encrypt_pii(payload.pan, context=context),
        aadhaar_encrypted=encrypt_pii(payload.aadhaar, context=context),
        bank_account_encrypted=encrypt_pii(payload.bank_account, context=context),
        bank_ifsc_encrypted=encrypt_pii(payload.bank_ifsc, context=context),
        epf_uan=payload.epf_uan.strip() if payload.epf_uan else None,
        esic_number=payload.esic_number.strip() if payload.esic_number else None,
        is_active=payload.is_active,
        biometric_consent_at=now if payload.biometric_consent else None,
        created_at=now,
        updated_at=now,
    )

    try:
        await emp_repo.insert_employee(session, emp)
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Employee already exists",
            "An employee with this code or linked user already exists in this tenant.",
        ) from exc

    return employee_to_out(emp)


async def get_employee(session: AsyncSession, tenant_id: UUID, employee_id: UUID) -> EmployeeOut:
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
    return employee_to_out(emp)


async def list_employees(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID | None = None,
    department_id: UUID | None = None,
    is_active: bool | None = None,
) -> list[EmployeeOut]:
    rows = await emp_repo.list_employees_by_tenant(
        session,
        tenant_id,
        branch_id=branch_id,
        department_id=department_id,
        is_active=is_active,
    )
    return [employee_to_out(emp) for emp in rows]


async def update_employee(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    payload: EmployeeUpdate,
) -> EmployeeOut:
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")

    if payload.branch_id is not None:
        branch = await emp_repo.get_branch(session, tenant_id, payload.branch_id)
        if branch is None:
            raise ProblemError(400, "Invalid branch", "Branch does not exist in this tenant.")
        emp.branch_id = payload.branch_id

    if payload.department_id is not None:
        dept = await emp_repo.get_department(session, tenant_id, payload.department_id)
        if dept is None:
            raise ProblemError(400, "Invalid department", "Department does not exist in this tenant.")
        emp.department_id = payload.department_id

    if payload.user_id is not None:
        user = await emp_repo.get_user(session, tenant_id, payload.user_id)
        if user is None:
            raise ProblemError(400, "Invalid user", "User does not exist in this tenant.")
        emp.user_id = payload.user_id

    if payload.full_name is not None:
        emp.full_name = payload.full_name.strip()
    if payload.designation is not None:
        emp.designation = payload.designation.strip()
    if payload.date_of_joining is not None:
        emp.date_of_joining = payload.date_of_joining
    if payload.date_of_birth is not None:
        emp.date_of_birth = payload.date_of_birth
    if payload.employment_type is not None:
        emp.employment_type = payload.employment_type
    if payload.probation_end_date is not None:
        emp.probation_end_date = payload.probation_end_date
    if payload.confirmation_date is not None:
        emp.confirmation_date = payload.confirmation_date

    context = str(tenant_id)
    if payload.pan is not None:
        emp.pan_encrypted = encrypt_pii(payload.pan, context=context)
    if payload.aadhaar is not None:
        emp.aadhaar_encrypted = encrypt_pii(payload.aadhaar, context=context)
    if payload.bank_account is not None:
        emp.bank_account_encrypted = encrypt_pii(payload.bank_account, context=context)
    if payload.bank_ifsc is not None:
        emp.bank_ifsc_encrypted = encrypt_pii(payload.bank_ifsc, context=context)

    if payload.epf_uan is not None:
        emp.epf_uan = payload.epf_uan.strip() if payload.epf_uan else None
    if payload.esic_number is not None:
        emp.esic_number = payload.esic_number.strip() if payload.esic_number else None

    if payload.biometric_consent is True:
        emp.biometric_consent_at = datetime.now(UTC)
    elif payload.biometric_consent is False:
        emp.biometric_consent_at = None

    if payload.is_active is not None:
        emp.is_active = payload.is_active

    emp.updated_at = datetime.now(UTC)

    try:
        await emp_repo.flush_employee(session)
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Employee update conflict",
            "Update failed due to unique constraint conflict.",
        ) from exc

    return employee_to_out(emp)


async def delete_employee(session: AsyncSession, tenant_id: UUID, employee_id: UUID) -> None:
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
    await emp_repo.delete_employee_record(session, emp)
