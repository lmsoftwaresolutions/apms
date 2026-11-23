from datetime import UTC, date, datetime
import hashlib
import json
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from app.adapters.base import BasePunchAdapter, CanonicalPunch
from app.adapters.csv_bulk import CSVBulkAdapter
from app.adapters.etimeoffice import ETimeOfficeAdapter
from app.adapters.zkteco import ZKTecoADMSAdapter
from app.models.punch import PunchEvent, RawEnvelope
from app.modules.attendance.cutoff import record_rollup_failure
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.punches.repository import (
    find_envelope_by_hash,
    find_recent_punch_within_window,
    get_employee_id_by_code,
    insert_punch_events,
    insert_raw_envelope,
)
from app.modules.punches.schemas import PunchIngestResult

IST = ZoneInfo("Asia/Kolkata")


def get_adapter_for_source(source: str) -> BasePunchAdapter:
    src = source.upper()
    if src in ("ETIMEOFFICE", "ETIME", "ESSL"):
        return ETimeOfficeAdapter()
    elif src in ("ZKTECO", "ADMS"):
        return ZKTecoADMSAdapter()
    elif src in ("CSV_BULK", "CSV", "EXCEL"):
        return CSVBulkAdapter()
    # Default to eTime if JSON, CSV otherwise
    return ETimeOfficeAdapter()


def compute_payload_hash(raw_payload: Any) -> str:
    if isinstance(raw_payload, str):
        payload_bytes = raw_payload.encode("utf-8")
    elif isinstance(raw_payload, bytes):
        payload_bytes = raw_payload
    else:
        payload_bytes = json.dumps(raw_payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload_bytes).hexdigest()


async def process_and_ingest_punches(
    session: Any,
    tenant_id: UUID,
    source: str,
    raw_payload: Any,
    device_identifier: str | None = None,
) -> PunchIngestResult:
    # 1. Compute SHA-256 hash for deduplication
    payload_hash = compute_payload_hash(raw_payload)

    # Check if duplicate envelope already ingested
    existing = await find_envelope_by_hash(session, tenant_id, payload_hash)
    if existing:
        return PunchIngestResult(
            raw_envelope_id=existing.id,
            source=source,
            total_received=0,
            active_punches=0,
            duplicates_ignored=0,
            unmatched_employees=[],
            is_duplicate=True,
        )

    # 2. Append-only persistence into raw_envelope (BR-ING-01)
    if isinstance(raw_payload, dict):
        normalized_payload = raw_payload
    elif isinstance(raw_payload, bytes):
        normalized_payload = {"data": raw_payload.decode("utf-8", errors="replace")}
    else:
        normalized_payload = {"data": str(raw_payload)}

    envelope = RawEnvelope(
        id=uuid4(),
        tenant_id=tenant_id,
        source=source.upper(),
        device_identifier=device_identifier,
        raw_payload=normalized_payload,
        payload_hash=payload_hash,
        received_at=datetime.now(UTC),
    )
    await insert_raw_envelope(session, envelope)

    # 3. Parse with Adapter SPI
    adapter = get_adapter_for_source(source)
    canonical_punches: list[CanonicalPunch] = adapter.parse_payload(raw_payload, device_identifier)

    active_count = 0
    duplicate_count = 0
    unmatched_codes: list[str] = []
    events_to_insert: list[PunchEvent] = []

    # Cache code to employee_id lookups
    employee_cache: dict[str, UUID | None] = {}

    for punch in canonical_punches:
        code = punch.employee_code
        if code not in employee_cache:
            emp_id = await get_employee_id_by_code(session, tenant_id, code)
            employee_cache[code] = emp_id

        emp_id = employee_cache[code]
        if not emp_id:
            if code not in unmatched_codes:
                unmatched_codes.append(code)
            continue

        # Clock drift warning (ENH-02): flag if punch_time deviates > 300s from ingest received_at
        loc_meta = dict(punch.location_meta) if punch.location_meta else {}
        if abs((punch.punch_time - envelope.received_at).total_seconds()) > 300:
            loc_meta["clock_drift_warning"] = True

        # 4. Debounce Engine: BR-PCH-01 (60-second window deduplication)
        recent = await find_recent_punch_within_window(
            session=session,
            tenant_id=tenant_id,
            employee_id=emp_id,
            punch_time=punch.punch_time,
            window_seconds=60,
        )

        punch_status = "ACTIVE"
        if recent is not None:
            punch_status = "DUPLICATE_IGNORED"
            duplicate_count += 1
        else:
            active_count += 1

        events_to_insert.append(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant_id,
                raw_envelope_id=envelope.id,
                employee_id=emp_id,
                punch_time=punch.punch_time,
                punch_direction=punch.punch_direction,
                source=punch.source,
                status=punch_status,
                location_meta=loc_meta if loc_meta else None,
                created_at=datetime.now(UTC),
            )
        )

    if events_to_insert:
        await insert_punch_events(session, events_to_insert)

        # 5. Auto-trigger attendance recalculation for affected dates (ENH-03)
        affected_dates: set[tuple[UUID, date]] = set()
        for p in events_to_insert:
            if p.status == "ACTIVE":
                cal_date = p.punch_time.astimezone(IST).date()
                affected_dates.add((p.employee_id, cal_date))

        for emp_id, cal_date in affected_dates:
            try:
                async with session.begin_nested():
                    await calculate_and_save_daily_attendance(
                        session=session,
                        tenant_id=tenant_id,
                        employee_id=emp_id,
                        calendar_date=cal_date,
                    )
            except Exception as exc:
                await record_rollup_failure(session, tenant_id, emp_id, cal_date, exc)

    return PunchIngestResult(
        raw_envelope_id=envelope.id,
        source=source.upper(),
        total_received=len(canonical_punches),
        active_punches=active_count,
        duplicates_ignored=duplicate_count,
        unmatched_employees=unmatched_codes,
        is_duplicate=False,
    )
