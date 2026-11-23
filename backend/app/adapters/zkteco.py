from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.adapters.base import BasePunchAdapter, CanonicalPunch

IST = ZoneInfo("Asia/Kolkata")


class ZKTecoADMSAdapter(BasePunchAdapter):
    """Adapter for ZKTeco ADMS push protocol (iclock/cdata tabular format)."""

    def parse_payload(self, raw_payload: Any, device_identifier: str | None = None) -> list[CanonicalPunch]:
        punches: list[CanonicalPunch] = []

        if isinstance(raw_payload, dict):
            # If wrapped in a dictionary payload
            content = raw_payload.get("data", "")
        elif isinstance(raw_payload, str):
            content = raw_payload
        else:
            return punches

        lines = content.strip().splitlines()
        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Standard ZKTeco cdata line: PIN\tYYYY-MM-DD HH:MM:SS\tSTATUS\tVERIFY_TYPE
            parts = [p.strip() for p in line.split("\t") if p.strip()]
            if len(parts) < 2:
                # Comma-separated variant
                parts = [p.strip() for p in line.split(",") if p.strip()]

            if len(parts) < 2:
                continue

            emp_code = parts[0]
            time_str = parts[1]

            try:
                # Standard ZKTeco time format
                local_dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
                utc_dt = local_dt.replace(tzinfo=IST).astimezone(UTC)
            except ValueError:
                try:
                    local_dt = datetime.strptime(time_str, "%d/%m/%Y %H:%M:%S")
                    utc_dt = local_dt.replace(tzinfo=IST).astimezone(UTC)
                except ValueError:
                    continue

            # In ZKTeco: status 0 = IN, 1 = OUT, 2 = BREAK_OUT, 3 = BREAK_IN, 4 = OT_IN, 5 = OT_OUT
            direction = "UNKNOWN"
            if len(parts) >= 3:
                status_val = parts[2]
                if status_val == "0":
                    direction = "IN"
                elif status_val == "1":
                    direction = "OUT"

            punches.append(
                CanonicalPunch(
                    employee_code=emp_code,
                    punch_time=utc_dt,
                    source="ZKTECO",
                    punch_direction=direction,
                    device_identifier=device_identifier,
                )
            )

        return punches
