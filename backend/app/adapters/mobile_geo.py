from datetime import UTC, datetime
import json
from typing import Any
from zoneinfo import ZoneInfo

from app.adapters.base import BasePunchAdapter, CanonicalPunch

IST = ZoneInfo("Asia/Kolkata")


class MobileGeoAdapter(BasePunchAdapter):
    """Adapter for ESS / Mobile Geofence punch payloads (M19)."""

    def parse_payload(self, raw_payload: Any, device_identifier: str | None = None) -> list[CanonicalPunch]:
        if isinstance(raw_payload, str):
            try:
                raw_payload = json.loads(raw_payload)
            except json.JSONDecodeError:
                return []

        if not isinstance(raw_payload, dict):
            return []

        emp_code = raw_payload.get("employee_code")
        if not emp_code:
            return []
        emp_code_str = str(emp_code).strip()
        if not emp_code_str:
            return []

        punch_time_val = raw_payload.get("punch_time")
        if isinstance(punch_time_val, str) and punch_time_val.strip():
            try:
                parsed = datetime.fromisoformat(punch_time_val.strip().replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=IST)
                utc_dt = parsed.astimezone(UTC)
            except ValueError:
                utc_dt = datetime.now(UTC)
        else:
            utc_dt = datetime.now(UTC)

        direction = str(raw_payload.get("punch_direction") or "UNKNOWN").upper()
        if direction not in ("IN", "OUT", "UNKNOWN"):
            direction = "UNKNOWN"

        meta: dict[str, Any] = {}
        for key in (
            "latitude",
            "longitude",
            "accuracy_m",
            "bssid",
            "geofence_verified",
            "distance_m",
            "branch_id",
            "branch_radius_m",
        ):
            if raw_payload.get(key) is not None:
                meta[key] = raw_payload[key]

        return [
            CanonicalPunch(
                employee_code=emp_code_str,
                punch_time=utc_dt,
                source="MOBILE_GEO",
                punch_direction=direction,
                device_identifier=device_identifier or "ess_mobile_web",
                location_meta=meta if meta else None,
            )
        ]
