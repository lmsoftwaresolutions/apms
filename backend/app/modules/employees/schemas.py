from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import DeletedOut

__all__ = ["EmployeeCreate", "EmployeeUpdate", "EmployeeOut", "DeletedOut"]

PAN_PATTERN = r"^[A-Z]{5}[0-9]{4}[A-Z]$"
AADHAAR_PATTERN = r"^[0-9]{12}$"
UAN_PATTERN = r"^[0-9]{12}$"
ESIC_PATTERN = r"^([0-9]{10}|[0-9]{17})$"
IFSC_PATTERN = r"^[A-Z]{4}0[A-Z0-9]{6}$"
BANK_ACCOUNT_PATTERN = r"^[0-9]{9,18}$"


def _uppercase(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().upper()
    return cleaned or None


def _digits(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = "".join(value.split())
    return cleaned or None


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=300)
    branch_id: UUID
    department_id: UUID | None = None
    designation_id: UUID | None = None
    user_id: UUID | None = None
    designation: str | None = Field(default=None, max_length=200)
    date_of_joining: date
    date_of_birth: date | None = None
    employment_type: str = Field(default="FULL_TIME", min_length=1, max_length=50)
    probation_end_date: date | None = None
    confirmation_date: date | None = None

    pan: str | None = Field(default=None, pattern=PAN_PATTERN)
    aadhaar: str | None = Field(default=None, pattern=AADHAAR_PATTERN)
    bank_account: str | None = Field(default=None, pattern=BANK_ACCOUNT_PATTERN)
    bank_ifsc: str | None = Field(default=None, pattern=IFSC_PATTERN)
    epf_uan: str | None = Field(default=None, pattern=UAN_PATTERN)
    esic_number: str | None = Field(default=None, pattern=ESIC_PATTERN)

    @field_validator("pan", "bank_ifsc", mode="before")
    @classmethod
    def normalize_codes(cls, value: str | None) -> str | None:
        return _uppercase(value)

    @field_validator("aadhaar", "bank_account", "epf_uan", "esic_number", mode="before")
    @classmethod
    def normalize_digits(cls, value: str | None) -> str | None:
        return _digits(value)

    # DPDP Act consent
    biometric_consent: bool = False
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=300)
    branch_id: UUID | None = None
    department_id: UUID | None = None
    designation_id: UUID | None = None
    user_id: UUID | None = None
    designation: str | None = Field(default=None, max_length=200)
    date_of_joining: date | None = None
    date_of_birth: date | None = None
    employment_type: str | None = Field(default=None, max_length=50)
    probation_end_date: date | None = None
    confirmation_date: date | None = None

    pan: str | None = Field(default=None, pattern=PAN_PATTERN)
    aadhaar: str | None = Field(default=None, pattern=AADHAAR_PATTERN)
    bank_account: str | None = Field(default=None, pattern=BANK_ACCOUNT_PATTERN)
    bank_ifsc: str | None = Field(default=None, pattern=IFSC_PATTERN)
    epf_uan: str | None = Field(default=None, pattern=UAN_PATTERN)
    esic_number: str | None = Field(default=None, pattern=ESIC_PATTERN)

    @field_validator("pan", "bank_ifsc", mode="before")
    @classmethod
    def normalize_codes(cls, value: str | None) -> str | None:
        return _uppercase(value)

    @field_validator("aadhaar", "bank_account", "epf_uan", "esic_number", mode="before")
    @classmethod
    def normalize_digits(cls, value: str | None) -> str | None:
        return _digits(value)

    biometric_consent: bool | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    user_id: UUID | None
    branch_id: UUID
    department_id: UUID | None
    designation_id: UUID | None = None
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
    epf_uan_masked: str | None = None
    esic_number_masked: str | None = None
    is_active: bool
    biometric_consent_at: datetime | None
    created_at: datetime
    updated_at: datetime
