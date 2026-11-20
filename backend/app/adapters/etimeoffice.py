from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.adapters.base import BasePunchAdapter, CanonicalPunch

IST = ZoneInfo("Asia/Kolkata")


class ETimeOfficeAdapter(BasePunchAdapter):
    """Adapter for eTimeOffice / eTimeTrackLite / eSSL Web API JSON push."""

    def parse_payload(self, raw_payload: Any, device_identifier: str | None = None) -> list[CanonicalPunch]:
        punches: list[CanonicalPunch] = []
        if not isinstance(raw_payload, dict):
            return punches

        items = raw_payload.get("PunchData")
        if not isinstance(items, list):
            return punches

        for item in items:
            if not isinstance(item, dict):
                continue

            emp_code = item.get("Empcode")
            if emp_code is None:
                continue
            # Preserve leading zeros as string (e.g. "0016")
            emp_code_str = str(emp_code).strip()
            if not emp_code_str:
                continue

            punch_date_str = item.get("PunchDate")
            if not punch_date_str or not isinstance(punch_date_str, str):
                continue

            # Parse "DD/MM/YYYY HH:MM:SS" (Standard Indian format in local IST)
            try:
                local_dt = datetime.strptime(punch_date_str.strip(), "%d/%m/%Y %H:%M:%S")
                # Attach IST timezone and convert to UTC
                utc_dt = local_dt.replace(tzinfo=IST)
            except ValueError:
                try:
                    # Fallback to ISO format if provided
                    utc_dt = datetime.fromisoformat(punch_date_str.strip())
                except ValueError:
                    continue

            name = item.get("Name")
            m_flag = item.get("M_Flag")
            meta = {}
            if name:
                meta["name"] = name
            if m_flag is not None:
                meta["m_flag"] = m_flag

            punches.append(
                CanonicalPunch(
                    employee_code=emp_code_str,
                    punch_time=utc_dt,
                    source="ETIMEOFFICE",
                    punch_direction="UNKNOWN",
                    device_identifier=device_identifier,
                    location_meta=meta if meta else None,
                )
            )

        return punches
