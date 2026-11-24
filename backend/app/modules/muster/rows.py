"""Muster lines carry attendance and leave. They never carry wages."""

from datetime import date
from decimal import Decimal


def muster_lines(
    employees: list[tuple[object, str]],
    attendance: list[tuple[object, date, str, int, int, str | None]],
    leave_marks: list[tuple[object, date, str, Decimal, str]],
) -> list[dict[str, object]]:
    names = {employee_id: code for employee_id, code in employees}
    by_key: dict[tuple[object, date], dict[str, object]] = {}

    def row(employee_id: object, day: date) -> dict[str, object]:
        key = (employee_id, day)
        if key not in by_key:
            by_key[key] = {
                "employee_id": str(employee_id),
                "employee_code": names.get(employee_id, ""),
                "calendar_date": day.isoformat(),
                "attendance_status": None,
                "worked_minutes": 0,
                "overtime_minutes": 0,
                "anomaly_code": None,
                "leave_type_code": None,
                "leave_days": None,
                "leave_portion": None,
            }
        return by_key[key]

    for employee_id, day, status, worked, overtime, anomaly in attendance:
        item = row(employee_id, day)
        item["attendance_status"] = status
        item["worked_minutes"] = worked
        item["overtime_minutes"] = overtime
        item["anomaly_code"] = anomaly
    for employee_id, day, code, days, portion in leave_marks:
        item = row(employee_id, day)
        item["leave_type_code"] = code
        item["leave_days"] = str(days)
        item["leave_portion"] = portion
    return [by_key[key] for key in sorted(by_key, key=lambda item: (names.get(item[0], ""), item[1]))]
