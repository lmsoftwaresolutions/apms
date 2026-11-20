import csv
from datetime import UTC, datetime
import io
from typing import Any
from zoneinfo import ZoneInfo

from app.adapters.base import BasePunchAdapter, CanonicalPunch

IST = ZoneInfo("Asia/Kolkata")


class CSVBulkAdapter(BasePunchAdapter):
    """Adapter for CSV/Excel bulk punch log uploads (CAP-03)."""

    def parse_payload(self, raw_payload: Any, device_identifier: str | None = None) -> list[CanonicalPunch]:
        punches: list[CanonicalPunch] = []

        if isinstance(raw_payload, dict):
            text_content = raw_payload.get("csv_text", "")
        elif isinstance(raw_payload, str):
            text_content = raw_payload
        elif isinstance(raw_payload, bytes):
            text_content = raw_payload.decode("utf-8", errors="replace")
        else:
            return punches

        reader = csv.DictReader(io.StringIO(text_content.strip()))
        if not reader.fieldnames:
            return punches

        # Normalize field names (case insensitive, stripped)
        field_map = {fn.strip().lower(): fn for fn in reader.fieldnames if fn}

        code_key = next((field_map[k] for k in ["employee_code", "emp_code", "empcode", "code", "pin"] if k in field_map), None)
        time_key = next((field_map[k] for k in ["punch_time", "punchdate", "timestamp", "datetime", "time"] if k in field_map), None)
        dir_key = next((field_map[k] for k in ["direction", "punch_direction", "type", "status"] if k in field_map), None)
        date_key = next((field_map[k] for k in ["date", "punch_date"] if k in field_map), None)

        if not code_key:
            return punches

        for row in reader:
            raw_code = row.get(code_key)
            if not raw_code:
                continue
            emp_code = str(raw_code).strip()
            if not emp_code:
                continue

            utc_dt = None
            if time_key and row.get(time_key):
                val = str(row[time_key]).strip()
                # If date is in a separate column
                if date_key and row.get(date_key):
                    d_val = str(row[date_key]).strip()
                    val = f"{d_val} {val}"

                # Try parsing formats
                for fmt in ["%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y/%m/%d %H:%M:%S"]:
                    try:
                        local_dt = datetime.strptime(val, fmt)
                        utc_dt = local_dt.replace(tzinfo=IST).astimezone(UTC)
                        break
                    except ValueError:
                        pass

                if utc_dt is None:
                    try:
                        parsed = datetime.fromisoformat(val)
                        if parsed.tzinfo is None:
                            utc_dt = parsed.replace(tzinfo=IST).astimezone(UTC)
                        else:
                            utc_dt = parsed.astimezone(UTC)
                    except ValueError:
                        continue
            else:
                continue

            direction = "UNKNOWN"
            if dir_key and row.get(dir_key):
                d = str(row[dir_key]).strip().upper()
                if d in ("IN", "0", "ENTRY"):
                    direction = "IN"
                elif d in ("OUT", "1", "EXIT"):
                    direction = "OUT"

            punches.append(
                CanonicalPunch(
                    employee_code=emp_code,
                    punch_time=utc_dt,
                    source="CSV_BULK",
                    punch_direction=direction,
                    device_identifier=device_identifier,
                )
            )

        return punches
