# Task: Shifts (M07) & Roster (M08) — Shift Templates, Dated Instances, Materialization & N67 Same-Day Overrides

## Labels
`enhancement`, `P0-Core`, `shifts`, `roster`, `dev1`

---

## Goal
Build the scheduling foundation for APMS:
1. Multi-modal shift template engine supporting **Fixed**, **Flexi**, **Overnight** ($T_{end} < T_{start}$), **Multi-Session / Split Shifts**, and **Continuous Duty** templates (`SHF-01`).
2. Automated forward materialization of recurring rotation patterns into immutable `dated_shift_instance` rows up to 30 days ahead (ADR-15, `SHF-02`).
3. Dual-path ad-hoc same-day modifications (`N67`, `SHF-03`): Direct supervisor override without mutating master recurring templates.
4. Employer-cancelled sessions (`ROS-10`, `N66d`) with `CANCELLED_PAID` credit for salaried employees.
5. Exportable `DatedShiftInstanceContract` interface to allow parallel integration with Dev 2 (Attendance Engine).

---

## Reference Specifications
- **Master SSOT**: `CONTEXT.md` §4 (M07 Shifts, M08 Roster), §3 (Invariants 1, 9)
- **Normative Requirements**: `docs/product/SRS.md` §4.3 (`SHF-01`, `SHF-02`, `SHF-03`, `SHF-04`, `ROS-01`–`ROS-06`, `ROS-10`)
- **Authoritative Business Rules**:
  - `BR-ATT-03`: Overnight Shift Attribution ($T_{end} < T_{start}$ attributed to commencement date $D$).
  - `BR-ROL-05`: Employer-Cancelled Sessions (`ROS-10`, Confirmed `N66d`).
  - `BR-ROL-06`: Ad-Hoc Same-Day Schedule Modifications (Confirmed `N67`).
- **Architecture & Invariants**:
  - `ADR-15`: Materialization of dated shift instances prior to attendance evaluation.
  - `ADR-31`: Explicit permission keys (`shift.template.*`, `roster.instance.*`).
  - `AGENTS.md` & `.agents/rules/apms-core.md`: RLS on every table, composite foreign keys `(tenant_id, foreign_id)`, strict 4-file modular architecture.

---

## Deliverables

### 1. Database Migration (`backend/alembic/versions/005_shifts_roster.py`)
- **`shift_templates`**:
  - Columns: `id` (UUID PK), `tenant_id` (UUID FK), `name` (varchar 200), `code` (varchar 50), `shift_type` (`FIXED`, `FLEXI`, `OVERNIGHT`, `SPLIT`, `CONTINUOUS`), `is_overnight` (bool), `is_active` (bool), `color_code` (varchar 20), `created_at` (timestamptz).
  - Constraints: Unique `(tenant_id, id)`, Unique `(tenant_id, code)`.
- **`shift_sessions`** (Multi-session / split shifts):
  - Columns: `id` (UUID PK), `tenant_id` (UUID), `shift_template_id` (UUID), `session_order` (int), `name` (varchar 100), `start_time` (time), `end_time` (time), `pre_window_minutes` (int, default 60), `post_window_minutes` (int, default 120), `grace_period_late_minutes` (int, default 15), `grace_period_early_minutes` (int, default 15), `min_presence_ratio` (numeric(3,2), default 0.50), `break_duration_minutes` (int, default 0).
  - Constraints: Unique `(tenant_id, shift_template_id, session_order)`, Composite FK `(tenant_id, shift_template_id)` references `shift_templates(tenant_id, id)` ON DELETE CASCADE.
- **`dated_shift_instances`** (Materialized instances):
  - Columns: `id` (UUID PK), `tenant_id` (UUID FK), `employee_id` (UUID), `calendar_date` (date), `shift_template_id` (UUID nullable), `status` (`SCHEDULED`, `CANCELLED_PAID`, `REST_DAY`), `is_adhoc_modified` (bool, default false), `modified_by_user_id` (UUID nullable), `modification_reason` (text nullable), `modified_at` (timestamptz nullable), `created_at` (timestamptz).
  - Constraints: Unique `(tenant_id, employee_id, calendar_date)`, Composite FK `(tenant_id, employee_id)` references `employees(tenant_id, id)` ON DELETE CASCADE, Composite FK `(tenant_id, shift_template_id)` references `shift_templates(tenant_id, id)`.
- **RLS & Security**:
  - `FORCE ROW LEVEL SECURITY` on all 3 tables with fail-closed regex UUID policies.
  - Grants: `SELECT, INSERT, UPDATE, DELETE` to `apms_app`.
- **Permissions Catalog**:
  - `shift.template.create`, `shift.template.read`, `shift.template.update`, `shift.template.delete`
  - `roster.instance.read`, `roster.instance.override`, `roster.instance.cancel`

### 2. Shifts Module (`backend/app/modules/shifts/`)
- `schemas.py`: Pydantic models `ShiftTemplateCreate`, `ShiftTemplateUpdate`, `ShiftTemplateRead`, `ShiftSessionCreate`, `ShiftSessionRead`.
- `repository.py`: Tenant-scoped queries with explicit `where(tenant_id == tenant_id)`.
- `service.py`:
  - Validates session order and non-overlapping time intervals.
  - Auto-flags `is_overnight = true` when $T_{end} < T_{start}$.
  - Exposes shared `DatedShiftInstanceContract` for Dev 2.
- `router.py`: REST endpoints mounted under `/api/v1/shifts`.

### 3. Roster Module (`backend/app/modules/roster/`)
- `schemas.py`: Pydantic models `RosterAssignmentCreate`, `DatedShiftInstanceRead`, `AdHocOverrideRequest`, `CancelSessionRequest`.
- `repository.py`: Bulk upsert for 30-day materialized instances, date-range employee instance fetching.
- `service.py`:
  - Materialization engine expanding weekly/rotational templates into `dated_shift_instances` (ADR-15).
  - N67 Supervisor direct override: updates target date's instance, sets `is_adhoc_modified = true`, leaves master template unchanged.
  - N66d Employer cancellation: sets instance status to `CANCELLED_PAID`.
  - Publishes `shift.modified` event (or calls recalculation hook) for affected employee and date.
- `router.py`: REST endpoints mounted under `/api/v1/roster`.

---

## Testing & Verification Plan

### Test File: `backend/tests/test_shifts.py`
1. **Template CRUD**: Create, read, update, delete Fixed and Split shifts.
2. **Overnight Math (`BR-ATT-03`)**: Create 22:00–06:00 shift $\rightarrow$ verify `is_overnight = true`, duration = 480 mins.
3. **Split Shift Validation**: Verify overlapping sessions in same template are rejected with 422.
4. **Negative RLS**: Tenant A cannot read or mutate Tenant B shift templates or sessions.
5. **Composite Foreign Key**: Inserting a session referencing another tenant's shift template fails DB constraint.

### Test File: `backend/tests/test_roster.py`
1. **Materialization Expansion (`ADR-15`)**: Generate 30-day instances for an employee $\rightarrow$ verify 30 daily instances created with correct dates.
2. **N67 Supervisor Override**: Override date $D$ to Shift B $\rightarrow$ verify instance updated, `is_adhoc_modified = true`, master pattern unchanged.
3. **N66d Employer Cancellation**: Cancel shift on date $D$ $\rightarrow$ verify status becomes `CANCELLED_PAID`.
4. **Negative RLS**: Tenant A cannot query or override Tenant B roster instances.

---

## Invariants Compliance Checklist
- [x] RLS + `app.current_tenant_id` context enforced on all tenant queries (Invariant 1).
- [x] Composite foreign keys `(tenant_id, foreign_id)` prevent cross-tenant referencing.
- [x] Master recurring templates are strictly protected; ad-hoc changes modify only dated instances (Invariant 9, N67).
- [x] Materialized instances expand before attendance evaluation (ADR-15).
- [x] Strict 4-file modular monolith pattern (service has zero SQLAlchemy; repository has zero FastAPI).
- [x] All endpoints protected by explicit permission keys (`shift.template.*`, `roster.instance.*`).
