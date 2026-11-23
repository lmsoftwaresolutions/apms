from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.adapters.csv_bulk import CSVBulkAdapter
from app.adapters.etimeoffice import ETimeOfficeAdapter
from app.adapters.zkteco import ZKTecoADMSAdapter

IST = ZoneInfo("Asia/Kolkata")


def test_etime_office_real_world_payload():
    """Verify eTime adapter parses real-world payload preserving leading zeros and IST to UTC."""
    payload = {
        "Error": False,
        "Msg": "Success",
        "IsAdmin": True,
        "PunchData": [
            {
                "Name": "DR. VAIBHAV KOLHE",
                "Empcode": "0016",
                "PunchDate": "20/11/2026 15:04:00",
                "M_Flag": None,
            },
            {
                "Name": "ASHWINI KARAD",
                "Empcode": "0033",
                "PunchDate": "20/11/2026 15:04:00",
                "M_Flag": None,
            },
            {
                "Name": "KARAN SANTOSH RAYKAR",
                "Empcode": "0078",
                "PunchDate": "20/11/2026 14:08:00",
                "M_Flag": None,
            },
        ],
    }

    adapter = ETimeOfficeAdapter()
    punches = adapter.parse_payload(payload, device_identifier="etime_device_01")

    assert len(punches) == 3

    # Check first punch: leading zeros preserved!
    p1 = punches[0]
    assert p1.employee_code == "0016"
    assert p1.source == "ETIMEOFFICE"
    assert p1.punch_direction == "UNKNOWN"
    assert p1.device_identifier == "etime_device_01"
    assert p1.location_meta == {"name": "DR. VAIBHAV KOLHE"}

    # Timezone check: 15:04:00 IST -> 09:34:00 UTC
    expected_utc = datetime(2026, 11, 20, 9, 34, 0, tzinfo=UTC)
    assert p1.punch_time == expected_utc
    assert p1.punch_time.tzinfo == UTC

    p3 = punches[2]
    assert p3.employee_code == "0078"
    expected_p3_utc = datetime(2026, 11, 20, 8, 38, 0, tzinfo=UTC)
    assert p3.punch_time == expected_p3_utc
    assert p3.punch_time.tzinfo == UTC


def test_zkteco_adms_tabular_payload():
    """Verify ZKTeco ADMS adapter parses tab-separated records and maps direction."""
    raw_text = (
        "EMP001\t2026-11-20 09:00:00\t0\t1\n"
        "EMP001\t2026-11-20 18:00:00\t1\t1\n"
        "EMP002\t2026-11-20 09:15:00\t0\t1\n"
    )

    adapter = ZKTecoADMSAdapter()
    punches = adapter.parse_payload(raw_text, device_identifier="zk_gate_01")

    assert len(punches) == 3
    assert punches[0].employee_code == "EMP001"
    assert punches[0].punch_direction == "IN"  # Status 0 = IN
    assert punches[0].source == "ZKTECO"
    assert punches[0].punch_time == datetime(2026, 11, 20, 3, 30, 0, tzinfo=UTC)
    assert punches[0].punch_time.tzinfo == UTC

    assert punches[1].employee_code == "EMP001"
    assert punches[1].punch_direction == "OUT"  # Status 1 = OUT
    assert punches[1].punch_time == datetime(2026, 11, 20, 12, 30, 0, tzinfo=UTC)
    assert punches[1].punch_time.tzinfo == UTC

    assert punches[2].employee_code == "EMP002"
    assert punches[2].punch_direction == "IN"


def test_csv_bulk_import_adapter():
    """Verify CSV adapter parses bulk spreadsheet text."""
    csv_data = (
        "employee_code,punch_time,direction\n"
        "0016,20/11/2026 09:00:00,IN\n"
        "0016,20/11/2026 18:00:00,OUT\n"
        "0033,20/11/2026 09:10:00,ENTRY\n"
    )

    adapter = CSVBulkAdapter()
    punches = adapter.parse_payload(csv_data)

    assert len(punches) == 3
    assert punches[0].employee_code == "0016"
    assert punches[0].punch_direction == "IN"
    assert punches[0].punch_time == datetime(2026, 11, 20, 3, 30, 0, tzinfo=UTC)
    assert punches[0].punch_time.tzinfo == UTC
    assert punches[1].employee_code == "0016"
    assert punches[1].punch_direction == "OUT"
    assert punches[1].punch_time == datetime(2026, 11, 20, 12, 30, 0, tzinfo=UTC)
    assert punches[1].punch_time.tzinfo == UTC
    assert punches[2].employee_code == "0033"
    assert punches[2].punch_direction == "IN"
    assert punches[1].punch_direction == "OUT"
    assert punches[2].employee_code == "0033"
    assert punches[2].punch_direction == "IN"
