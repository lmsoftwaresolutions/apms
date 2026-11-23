# Task: Raw Punch Ingest & Adapters (M09) & Attendance Engine (M10) — Append-Only Capture, Debounce, Session Pairing, N65 Gap Exclusion, Rollup & Explanation Traces

## Labels
`enhancement`, `P0-Core`, `punch-ingest`, `attendance-engine`, `dev2`

---

## Goal
Build the vendor-agnostic punch capture pipeline and deterministic attendance calculation engine:
1. Vendor-agnostic device adapter SPI supporting **ZKTeco ADMS push**, **eSSL HTTP push**, and **CSV bulk imports** (`CAP-01`–`CAP-05`).
2. Strictly append-only raw ingestion pipeline (`raw_envelope` $\rightarrow$ `punch_event`) with 60-second debounce deduplication (`ATT-01`, `BR-ING-01`, `BR-PCH-01`).
3. Session-aware chronological punch pairing within $[T_{start} - W_{pre}, T_{end} + W_{post}]$ (`ATT-02`, `BR-ATT-01`).
4. Strict exclusion of multi-session mid-shift gaps from worked hours and overtime (`ATT-03`, Confirmed `N65`).
5. Deterministic daily rollup under `DURATION_RATIO` mode (`ATT-04`, `BR-ROL-01`, Confirmed `N66a`).
6. Session minimum-presence eligibility cap for split shifts (`ATT-05`, `BR-ROL-03`, Confirmed `N66b`).
7. Single-punch anomaly detection defaulting to `NEEDS_REVIEW` with zero unearned overtime (`ATT-08`, `BR-ATT-04`, `BR-ATT-16`, Confirmed `Q4`).
8. Immutable JSON explanation trace persistence for every daily attendance evaluation (`ATT-09`, Invariant 4).

---

## Reference Specifications
- **Master SSOT**: `CONTEXT.md` §2 (Processor architecture), §3 (Invariants 2, 3, 4, 6), §4 (M09, M10), §5.3, §7
- **Normative Requirements**:
  - `docs/product/SRS.md` §4.1 (`CAP-01`–`CAP-05`)
  - `docs/product/SRS.md` §4.2 (`ATT-01`–`ATT-10`)
- **Authoritative Business Rules**:
  - `BR-ING-01`: Immutable Raw Ingestion (`raw_envelope`).
  - `BR-PCH-01`: Idempotency & Debounce Window (60-second window, first `ACTIVE`, subsequent `DUPLICATE_IGNORED`).
  - `BR-ATT-01`: Session-Aware Chronological Pairing ($[T_{start, j} - W_{pre}, T_{end, j} + W_{post}]$).
  - `BR-ATT-02`: Mid-Shift Gap Handling (Confirmed `N65`).
  - `BR-ATT-04`: Single-Punch Anomaly Treatment (Confirmed `Q4`).
  - `BR-ATT-16`: Lone-Punch Guardrails.
  - `BR-ROL-01` & `BR-ROL-02`: Daily Rollup Mode & Status Mapping Bands (Confirmed `N66a`).
  - `BR-ROL-03`: Session Minimum-Presence Eligibility (Confirmed `N66b`).
- **Architecture & Invariants**:
  - `ADR-01`: Modular monolith separation of ingestion, attendance processor, and payroll.
  - `ADR-31`: Permission-keyed RBAC (`capture.punch.*`, `attendance.daily.*`, `attendance.trace.*`).

---

## Deliverables

### 1. Database Migration (`backend/alembic/versions/006_raw_punch_attendance.py`)
- **`raw_envelope`** (Append-Only):
  - Columns: `id` (UUID PK), `tenant_id` (UUID FK), `source` (`ZKTECO`, `ESSL`, `CSV_BULK`, `MOBILE_GEO`, `MANUAL`), `device_identifier` (varchar 100), `raw_payload` (jsonb), `received_at` (timestamptz), `payload_hash` (varchar 64).
  - Constraints: Unique `(tenant_id, id)`.
- **`punch_event`** (Normalized Canonical Punches, Append-Only):
  - Columns: `id` (UUID PK), `tenant_id` (UUID FK), `raw_envelope_id` (UUID), `employee_id` (UUID), `punch_time` (timestamptz), `punch_direction` (`IN`, `OUT`, `UNKNOWN`), `source` (varchar 50), `status` (`ACTIVE`, `DUPLICATE_IGNORED`), `location_meta` (jsonb nullable), `created_at` (timestamptz).
  - Constraints: Unique `(tenant_id, id)`, Composite FK `(tenant_id, employee_id)` references `employees(tenant_id, id)` ON DELETE CASCADE, Composite FK `(tenant_id, raw_envelope_id)` references `raw_envelope(tenant_id, id)`.
- **`attendance_daily_records`**:
  - Columns: `id` (UUID PK), `tenant_id` (UUID FK), `employee_id` (UUID), `calendar_date` (date), `dated_shift_instance_id` (UUID nullable), `status` (`PRESENT`, `HALF_DAY`, `ABSENT`, `NEEDS_REVIEW`, `REST_DAY`), `worked_duration_minutes` (int), `scheduled_duration_minutes` (int), `worked_ratio` (numeric(5,4)), `late_minutes` (int), `early_departure_minutes` (int), `overtime_minutes` (int), `is_single_punch` (bool), `anomaly_code` (varchar 50 nullable), `created_at` (timestamptz), `updated_at` (timestamptz).
  - Constraints: Unique `(tenant_id, employee_id, calendar_date)`, Composite FK `(tenant_id, employee_id)` references `employees(tenant_id, id)` ON DELETE CASCADE.
- **`attendance_explanation_traces`** (Immutable Audit Traces):
  - Columns: `id` (UUID PK), `tenant_id` (UUID FK), `attendance_record_id` (UUID), `employee_id` (UUID), `calendar_date` (date), `trace_payload` (jsonb), `evaluated_at` (timestamptz).
  - Constraints: Unique `(tenant_id, attendance_record_id)`, Composite FK `(tenant_id, attendance_record_id)` references `attendance_daily_records(tenant_id, id)` ON DELETE CASCADE.
- **RLS & Permissions**:
  - `FORCE ROW LEVEL SECURITY` on all 4 tables.
  - Revoke `UPDATE, DELETE` on `raw_envelope` and `punch_event` (Append-Only Invariant 2).
  - Permissions: `capture.punch.ingest`, `capture.punch.read`, `attendance.daily.read`, `attendance.daily.recalculate`, `attendance.trace.read`.

### 2. Device Adapter SPI Layer (`backend/app/adapters/`)
- `base.py`:
  - `CanonicalPunch(employee_code, punch_time, punch_direction, device_id, raw_meta)`.
  - `BasePunchAdapter` interface with `parse_payload(raw_body: bytes | str) -> list[CanonicalPunch]`.
- `zkteco.py`: ZKTeco ADMS push protocol handler (parses `/iclock/cdata` table formats).
- `essl.py`: eSSL / generic JSON and URL-encoded HTTP push parser.
- `csv_bulk.py`: Bulk CSV file parser mapping employee code, date, and time.

### 3. Punches Module (`backend/app/modules/punches/`)
- `schemas.py`: `PunchIngestRequest`, `PunchEventRead`.
- `service.py`:
  - Persists incoming payload into `raw_envelope` with SHA-256 hash.
  - Resolves `employee_code` to `employee_id`.
  - Applies 60-second debounce deduplication: marks repeat punches as `DUPLICATE_IGNORED`.
  - Triggers attendance re-pairing job for affected employee and calendar date.
- `repository.py`: Tenant-scoped insert for `raw_envelope` and `punch_event`.
- `router.py`: Ingest endpoints mounted under `/api/v1/punches`.

### 4. Attendance Engine Module (`backend/app/modules/attendance/`)
- `engine/pairing.py`:
  - Matches active punches into session ingestion windows $[T_{start, j} - W_{pre}, T_{end, j} + W_{post}]$.
  - Designates first punch as `Session In` and last punch as `Session Out`.
  - Calculates session worked duration minus intra-session break minutes.
  - Enforces **N65 mid-session gap exclusion**: Strictly ignores and drops any time between $T_{end, 1}$ and $T_{start, 2}$.
- `engine/rollup.py`:
  - Calculates $R = \sum \text{Worked} / \sum \text{Scheduled}$.
  - Maps to status: $R \ge 0.90 \rightarrow \text{PRESENT}$, $0.50 \le R < 0.90 \rightarrow \text{HALF\_DAY}$, $< 0.50 \rightarrow \text{ABSENT}$.
  - Enforces **N66b split-session cap**: If any session worked duration $< \mu \times \text{Scheduled}$, daily status is capped at `HALF_DAY`.
  - Enforces **Q4 single punch anomaly**: Lone punch $\rightarrow$ status = `NEEDS_REVIEW`, anomaly = `LONE_PUNCH_ANOMALY`, overtime = 0.
- `engine/trace.py`:
  - Formats comprehensive JSON trace detailing rule inputs, session window timings, raw punch matches, mid-gap exclusions, ratio calculations, and policy band decisions.
- `router.py`: Query endpoints `/api/v1/attendance/daily`, recalculation endpoint `/api/v1/attendance/recalculate`, and trace endpoint `/api/v1/attendance/{id}/trace`.

---

## Testing & Verification Plan

### Test File: `backend/tests/test_adapters.py`
1. **eTimeOffice / eSSL JSON Parser (Real-World Golden Vector)**:
   - Feeds exact eTime payload:
     ```json
     {
       "Error": false,
       "Msg": "Success",
       "IsAdmin": true,
       "PunchData": [
         {"Name": "DR. VAIBHAV KOLHE", "Empcode": "0016", "PunchDate": "20/11/2026 15:04:00", "M_Flag": null},
         {"Name": "ASHWINI KARAD", "Empcode": "0033", "PunchDate": "20/11/2026 15:04:00", "M_Flag": null},
         {"Name": "SHRIHARI KHADAKE", "Empcode": "0058", "PunchDate": "20/11/2026 14:23:00", "M_Flag": null}
       ]
     }
     ```
   - Verifies:
     - Preserves leading zeros in employee code (`"0016"`, not `16`).
     - Parses Indian date format `"DD/MM/YYYY HH:MM:SS"` with IST $\rightarrow$ UTC timezone conversion (`"20/11/2026 15:04:00"` IST $\rightarrow$ `2026-11-20T09:34:00Z`).
     - Maps direction to `UNKNOWN` (to be paired chronologically by M10).
2. **ZKTeco ADMS Parser**: Feeds realistic ZKTeco ADMS raw string $\rightarrow$ verifies canonical punches parsed.
3. **CSV Bulk Import**: Feeds 10-line CSV $\rightarrow$ verifies batch conversion to canonical events.

### Test File: `backend/tests/test_raw_punch.py`
1. **Raw Envelope Immutability**: Verify append-only persistence. Attempting to update or delete raises DB permission error.
2. **Debounce Deduplication (`BR-PCH-01`)**: Send 2 punches for same employee within 30 seconds $\rightarrow$ verify 1st is `ACTIVE`, 2nd is `DUPLICATE_IGNORED`.
3. **Negative RLS**: Tenant A cannot view Tenant B punches.

### Test File: `backend/tests/test_attendance_engine.py` (Golden Vectors)
1. **Standard Fixed 9h Day**: Punches 09:00 In, 18:00 Out $\rightarrow$ Worked = 540 min, Ratio = 1.0 $\rightarrow$ `PRESENT` (1.0).
2. **N65 Split Shift Mid-Gap Exclusion**:
   - Scheduled: Session 1 (08:00–12:00, 4h), Gap (12:00–16:00, 4h), Session 2 (16:00–20:00, 4h). Total Scheduled = 8h.
   - Punches: 08:00 In, 12:00 Out, 16:00 In, 20:00 Out.
   - Assert: Worked Duration = 8 hours (480 min). 4-hour gap is **strictly excluded** from worked time and OT denominator.
3. **N66b Split Shift Cap (Missed Second Session)**:
   - Same split schedule.
   - Punches: 08:00 In, 12:00 Out. (Session 2 completely absent).
   - Assert: Session 1 = `COMPLETED`, Session 2 = `BELOW_MIN`. Daily status is strictly capped at `HALF_DAY` (0.5), even if tenant threshold would otherwise evaluate ratio differently.
4. **Q4 Lone Punch Anomaly**:
   - Scheduled 09:00–18:00. Punch: only 09:00 In.
   - Assert: Status = `NEEDS_REVIEW`, `anomaly_code = 'LONE_PUNCH_ANOMALY'`, Overtime = 0.
5. **Trace Validation (`ATT-09`)**:
   - Query explanation trace $\rightarrow$ assert JSON contains `rule_inputs`, `sessions_evaluated`, `gap_minutes_excluded`, `ratio`, and `status_assigned`.

---

## Invariants Compliance Checklist
- [x] Invariant 1: RLS + `app.current_tenant_id` context enforced on all tenant queries.
- [x] Invariant 2: `raw_envelope` and `punch_event` are strictly append-only (no updates/deletions).
- [x] Invariant 3: Attendance engine does not compute payroll; payroll never mutates punches.
- [x] Invariant 4: Immutable JSON explanation trace generated and saved for every daily rollup calculation.
- [x] Invariant 6: N65 mid-session gaps strictly excluded from worked hours and overtime.
- [x] Invariant 9: Device adapters isolated from attendance math via SPI interface.
- [x] Q4 lone punch guardrails: strictly flags `NEEDS_REVIEW`, never auto-grants overtime.
