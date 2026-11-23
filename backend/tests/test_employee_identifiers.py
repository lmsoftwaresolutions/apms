from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.modules.employees.schemas import EmployeeCreate


def _payload(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "employee_code": "E-1",
        "full_name": "Identifier Employee",
        "branch_id": str(uuid4()),
        "date_of_joining": date(2026, 1, 1),
    }
    body.update(overrides)
    return body


def test_statutory_identifiers_accept_real_formats() -> None:
    created = EmployeeCreate.model_validate(
        _payload(
            pan="abcde1234f",
            aadhaar="1234 5678 9012",
            bank_account="123456789012",
            bank_ifsc="sbin0001234",
            epf_uan="1000 1234 5678",
            esic_number="12345678901234567",
        )
    )
    assert created.pan == "ABCDE1234F"
    assert created.aadhaar == "123456789012"
    assert created.bank_ifsc == "SBIN0001234"
    assert created.epf_uan == "100012345678"
    assert created.esic_number == "12345678901234567"


@pytest.mark.parametrize(
    "field,value",
    [
        ("pan", "ABCDE123"),
        ("aadhaar", "1234"),
        ("bank_account", "12345678"),
        ("bank_ifsc", "SBIN1001234"),
        ("epf_uan", "12345"),
        ("esic_number", "123456789012"),
    ],
)
def test_statutory_identifiers_reject_wrong_shape(field: str, value: str) -> None:
    with pytest.raises(ValidationError):
        EmployeeCreate.model_validate(_payload(**{field: value}))
