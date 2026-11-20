from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=300)
    branch_id: UUID
    department_id: UUID | None = None
    user_id: UUID | None = None
    designation: str | None = Field(default=None, max_length=200)
    date_of_joining: date
    date_of_birth: date | None = None
    employment_type: str = Field(default="FULL_TIME", max_length=50)
    probation_end_date: date | None = None
    confirmation_date: date | None = None

    # Raw PII inputs on write (will be encrypted into vault)
    pan: str | None = Field(default=None, max_length=20)
    aadhaar: str | None = Field(default=None, max_length=20)
    bank_account: str | None = Field(default=None, max_length=50)
    bank_ifsc: str | None = Field(default=None, max_length=20)

    # Statutory identifiers
    epf_uan: str | None = Field(default=None, max_length=50)
    esic_number: str | None = Field(default=None, max_length=50)

    # DPDP Act consent
    biometric_consent: bool = False
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=300)
    branch_id: UUID | None = None
    department_id: UUID | None = None
    user_id: UUID | None = None
    designation: str | None = Field(default=None, max_length=200)
    date_of_joining: date | None = None
    date_of_birth: date | None = None
    employment_type: str | None = Field(default=None, max_length=50)
    probation_end_date: date | None = None
    confirmation_date: date | None = None

    # Raw PII updates
    pan: str | None = Field(default=None, max_length=20)
    aadhaar: str | None = Field(default=None, max_length=20)
    bank_account: str | None = Field(default=None, max_length=50)
    bank_ifsc: str | None = Field(default=None, max_length=20)

    epf_uan: str | None = Field(default=None, max_length=50)
    esic_number: str | None = Field(default=None, max_length=50)

    biometric_consent: bool | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    user_id: UUID | None
    branch_id: UUID
    department_id: UUID | None
    employee_code: str
    full_name: str
    designation: str | None
    date_of_joining: date
    date_of_birth: date | None
    employment_type: str
    probation_end_date: date | None
    confirmation_date: date | None

    # Masked PII outputs (SEC-02: raw plaintext is never leaked)
    pan_masked: str | None = None
    aadhaar_masked: str | None = None
    bank_account_masked: str | None = None
    bank_ifsc_masked: str | None = None

    epf_uan: str | None
    esic_number: str | None
    is_active: bool
    biometric_consent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DeletedOut(BaseModel):
    id: UUID
