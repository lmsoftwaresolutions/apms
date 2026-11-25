from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import (
    decrypt_pii,
    encrypt_pii,
    fingerprint_pii,
    mask_aadhaar,
    mask_bank_account,
    mask_bank_ifsc,
    mask_digits,
    mask_pan,
)
from app.core.errors import ProblemError
from app.models.employee import Employee
from app.modules.branches import repository as branch_repo
from app.modules.departments import repository as dept_repo
from app.modules.designations import repository as desig_repo
from app.modules.employees import repository as emp_repo
from app.modules.privacy.repository import insert_consent_event
from app.modules.privacy.service import consent_action
from app.modules.employees.schemas import EmployeeCreate, EmployeeOut, EmployeeUpdate
from app.modules.iam import repository as iam_repo


def employee_to_out(emp: Employee) -> EmployeeOut:
    """Transform an Employee ORM model into an EmployeeOut schema with masked PII."""
    context = str(emp.tenant_id)
    raw_pan = decrypt_pii(emp.pan_encrypted, context=context)
    raw_aadhaar = decrypt_pii(emp.aadhaar_encrypted, context=context)
    raw_bank_account = decrypt_pii(emp.bank_account_encrypted, context=context)
    raw_bank_ifsc = decrypt_pii(emp.bank_ifsc_encrypted, context=context)
    raw_uan = decrypt_pii(emp.epf_uan_encrypted, context=context)
    raw_esic = decrypt_pii(emp.esic_number_encrypted, context=context)

    return EmployeeOut(
        id=emp.id,
        tenant_id=emp.tenant_id,
        user_id=emp.user_id,
        branch_id=emp.branch_id,
        department_id=emp.department_id,
        designation_id=emp.designation_id,
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
        epf_uan_masked=mask_digits(raw_uan),
        esic_number_masked=mask_digits(raw_esic),
        is_active=emp.is_active,
        biometric_consent_at=emp.biometric_consent_at,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


async def _require_branch(session: AsyncSession, tenant_id: UUID, branch_id: UUID) -> None:
    branch = await branch_repo.get_branch_by_id(session, tenant_id, branch_id)
    if branch is None:
        raise ProblemError(400, "Invalid branch", "Branch does not exist in this tenant.")
    if not branch.is_active:
        raise ProblemError(400, "Inactive branch", "Cannot assign employee to a deactivated branch.")


async def _require_department_in_branch(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
    branch_id: UUID,
) -> None:
    dept = await dept_repo.get_department_by_id(session, tenant_id, department_id)
    if dept is None:
        raise ProblemError(400, "Invalid department", "Department does not exist in this tenant.")
    if dept.branch_id != branch_id:
        raise ProblemError(400, "Invalid department", "Department must belong to the employee's branch.")
    if not dept.is_active:
        raise ProblemError(400, "Inactive department", "Cannot assign employee to a deactivated department.")


async def _require_designation_in_department(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
    department_id: UUID | None,
) -> str:
    desig = await desig_repo.get_designation_by_id(session, tenant_id, designation_id)
    if desig is None:
        raise ProblemError(400, "Invalid designation", "Designation does not exist in this tenant.")
    if not desig.is_active:
        raise ProblemError(400, "Inactive designation", "Cannot assign an inactive designation.")
    if department_id is None or desig.department_id != department_id:
        raise ProblemError(400, "Invalid designation", "Designation does not belong to the employee's department.")
    return desig.name


def _assign_identifier(
    emp: Employee,
    fields_set: set[str],
    field_name: str,
    value: str | None,
    context: str,
    encrypted_attr: str,
    fingerprint_attr: str,
) -> None:
    if field_name not in fields_set:
        return
    setattr(emp, encrypted_attr, encrypt_pii(value, context=context))
    setattr(emp, fingerprint_attr, fingerprint_pii(value, context))


async def _require_user(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> None:
    user = await iam_repo.get_user_by_id(session, user_id)
    if user is None or user.tenant_id != tenant_id:
        raise ProblemError(400, "Invalid user", "User does not exist in this tenant.")


async def create_employee(
    session: AsyncSession,
    tenant_id: UUID,
    payload: EmployeeCreate,
    actor_user_id: UUID | None = None,
) -> EmployeeOut:
    await _require_branch(session, tenant_id, payload.branch_id)
    if payload.department_id is not None:
        await _require_department_in_branch(session, tenant_id, payload.department_id, payload.branch_id)
    if payload.user_id is not None:
        await _require_user(session, tenant_id, payload.user_id)

    designation_name: str | None = None
    if payload.designation_id is not None:
        designation_name = await _require_designation_in_department(
            session, tenant_id, payload.designation_id, payload.department_id
        )
    elif payload.designation:
        designation_name = payload.designation.strip()

    context = str(tenant_id)
    now = datetime.now(UTC)

    emp = Employee(
        id=uuid4(),
        tenant_id=tenant_id,
        user_id=payload.user_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
        designation_id=payload.designation_id,
        employee_code=payload.employee_code.strip(),
        full_name=payload.full_name.strip(),
        designation=designation_name,
        date_of_joining=payload.date_of_joining,
        date_of_birth=payload.date_of_birth,
        employment_type=payload.employment_type,
        probation_end_date=payload.probation_end_date,
        confirmation_date=payload.confirmation_date,
        # Field-level envelope encryption
        pan_encrypted=encrypt_pii(payload.pan, context=context),
        pan_fingerprint=fingerprint_pii(payload.pan, context),
        aadhaar_encrypted=encrypt_pii(payload.aadhaar, context=context),
        aadhaar_fingerprint=fingerprint_pii(payload.aadhaar, context),
        bank_account_encrypted=encrypt_pii(payload.bank_account, context=context),
        bank_ifsc_encrypted=encrypt_pii(payload.bank_ifsc, context=context),
        epf_uan_encrypted=encrypt_pii(payload.epf_uan, context=context),
        epf_uan_fingerprint=fingerprint_pii(payload.epf_uan, context),
        esic_number_encrypted=encrypt_pii(payload.esic_number, context=context),
        esic_number_fingerprint=fingerprint_pii(payload.esic_number, context),
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

    if payload.biometric_consent:
        await insert_consent_event(session, tenant_id, emp.id, "GRANTED", actor_user_id)

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
    actor_user_id: UUID | None = None,
) -> EmployeeOut:
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")

    original_branch_id = emp.branch_id
    original_department_id = emp.department_id
    had_consent = emp.biometric_consent_at is not None
    target_branch_id = payload.branch_id if payload.branch_id is not None else original_branch_id
    if payload.branch_id is not None and payload.branch_id != original_branch_id:
        await _require_branch(session, tenant_id, payload.branch_id)

    if "department_id" in payload.model_fields_set:
        new_department_id = payload.department_id
    else:
        new_department_id = emp.department_id
    if new_department_id is not None:
        if new_department_id != original_department_id or payload.branch_id is not None:
            await _require_department_in_branch(session, tenant_id, new_department_id, target_branch_id)
        else:
            dept = await dept_repo.get_department_by_id(session, tenant_id, new_department_id)
            if dept is None or dept.branch_id != target_branch_id:
                raise ProblemError(400, "Invalid department", "Department must belong to the employee's branch.")

    if "user_id" in payload.model_fields_set and payload.user_id is not None:
        await _require_user(session, tenant_id, payload.user_id)

    if "designation_id" not in payload.model_fields_set and original_department_id != new_department_id:
        if emp.designation_id is not None:
            cur_desig = await desig_repo.get_designation_by_id(session, tenant_id, emp.designation_id)
            if cur_desig is None or cur_desig.department_id != new_department_id:
                raise ProblemError(
                    400,
                    "Invalid designation",
                    "Existing employee designation does not belong to the new department. Reassign or clear designation first.",
                )

    if payload.branch_id is not None:
        emp.branch_id = payload.branch_id
    if "department_id" in payload.model_fields_set:
        emp.department_id = payload.department_id
    if "user_id" in payload.model_fields_set:
        emp.user_id = payload.user_id

    if payload.full_name is not None:
        emp.full_name = payload.full_name.strip()
    if "designation_id" in payload.model_fields_set:
        if payload.designation_id is not None:
            desig_name = await _require_designation_in_department(
                session, tenant_id, payload.designation_id, new_department_id
            )
            emp.designation_id = payload.designation_id
            emp.designation = desig_name
        else:
            emp.designation_id = None
            if "designation" in payload.model_fields_set and payload.designation:
                emp.designation = payload.designation.strip()
            else:
                emp.designation = None
    elif payload.designation is not None:
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
    _assign_identifier(emp, payload.model_fields_set, "pan", payload.pan, context, "pan_encrypted", "pan_fingerprint")
    _assign_identifier(
        emp, payload.model_fields_set, "aadhaar", payload.aadhaar, context, "aadhaar_encrypted", "aadhaar_fingerprint"
    )
    if "bank_account" in payload.model_fields_set:
        emp.bank_account_encrypted = encrypt_pii(payload.bank_account, context=context)
    if "bank_ifsc" in payload.model_fields_set:
        emp.bank_ifsc_encrypted = encrypt_pii(payload.bank_ifsc, context=context)
    _assign_identifier(
        emp, payload.model_fields_set, "epf_uan", payload.epf_uan, context, "epf_uan_encrypted", "epf_uan_fingerprint"
    )
    _assign_identifier(
        emp,
        payload.model_fields_set,
        "esic_number",
        payload.esic_number,
        context,
        "esic_number_encrypted",
        "esic_number_fingerprint",
    )

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

    action = consent_action(had_consent, payload.biometric_consent)
    if action is not None:
        await insert_consent_event(session, tenant_id, emp.id, action, actor_user_id)

    return employee_to_out(emp)


async def delete_employee(session: AsyncSession, tenant_id: UUID, employee_id: UUID) -> None:
    """Offboarding keeps the row. Attendance traces and consent history cannot be deleted."""
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
    emp.is_active = False
    emp.updated_at = datetime.now(UTC)
    await emp_repo.flush_employee(session)
