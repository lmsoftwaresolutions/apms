"""Streaming CSV muster roll generator with UTF-8 BOM and memory safety.

Attendance processor is strictly decoupled from payroll:
Emits status codes and hours only, without wage data.
"""

import calendar
import csv
import io
from collections.abc import AsyncIterator
from typing import Any


async def stream_muster_csv(
    data: dict[str, Any],
    tenant_meta: dict[str, Any],
    year: int,
    month: int,
) -> AsyncIterator[str]:
    """Yield CSV chunks starting with UTF-8 BOM, streaming line-by-line."""
    num_days = calendar.monthrange(year, month)[1]

    # Standard CSV headers
    headers = [
        "employee_code",
        "employee_name",
        "department",
        "designation",
        *[f"day_{d}" for d in range(1, num_days + 1)],
        "total_present",
        "total_absent",
        "total_leave",
        "worked_hours",
        "ot_hours",
    ]

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(headers)
    # UTF-8 BOM for seamless Microsoft Excel opening
    yield "\ufeff" + out.getvalue()

    for emp in data.get("employees", []):
        out = io.StringIO()
        writer = csv.writer(out)
        daily = emp.get("daily_status", {})
        summary = emp.get("summary", {})

        row = [
            emp.get("employee_code", ""),
            emp.get("employee_name", ""),
            emp.get("department", ""),
            emp.get("designation", ""),
            *[daily.get(d, "-") for d in range(1, num_days + 1)],
            summary.get("total_present", 0),
            summary.get("total_absent", 0),
            summary.get("total_leave", 0),
            summary.get("worked_hours", 0),
            summary.get("ot_hours", 0),
        ]
        writer.writerow(row)
        yield out.getvalue()
