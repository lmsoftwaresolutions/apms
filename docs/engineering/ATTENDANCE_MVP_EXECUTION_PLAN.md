# APMS — Attendance MVP Sequential Implementation Plan

> **Normative Roadmap.** Defines the dependency-ordered, step-by-step execution plan for the APMS Attendance MVP (Phase 1 through Phase 5).  
> **Master Reference:** [`CONTEXT.md`](../../CONTEXT.md) · **Requirements:** [`docs/product/SRS.md`](../product/SRS.md) · **Formulas:** [`docs/requirements/BUSINESS_RULES.md`](../requirements/BUSINESS_RULES.md)

---

## 1. Strategy & Status Overview

* **Main Branch:** Contains core IAM, Branches, Departments, Designations, Employees/PII Vault, Shifts, Roster, Punch Ingestion, and Attendance Engine.
* **`feat/leave-and-muster` Branch:** Contains the complete implementation of **Wave A** (Attendance Foundation: #26 Regularization, #40 Cutoff Worker, #41 ESS APIs, SEC-01/03 Consent & PII Audit, CAP-02 Edge Buffer) and **Wave C** (Leave & Muster: #27 Double-Entry Leave Ledger & Holidays, #28 Statutory Muster Roll). Zero conflicts with `main`.
* **Current Focus:** Review and land `feat/leave-and-muster`, then execute the Operator & ESS UI.

---

## 2. Complete Issue Status Matrix

### ✅ Implemented (Ready on `feat/leave-and-muster`)

| Issue | Module | Title | Status / Artifacts on Branch |
|---|---|---|---|
| **#26** | **M18** | `feat(M18): Attendance Regularization & Missing Punch Correction Workflow` | ✅ **DONE on branch** (`app/modules/regularizations/`, `regularization_requests` table with RLS, review/approve endpoint, synthetic punch generation, auto-recalc) |
| **#40** | **M10** | `feat(M10): Scheduled End-of-Day Attendance Rollup Worker` | ✅ **DONE on branch** (`app/modules/attendance/cutoff.py`, overnight post-window wait, zero-punch `ABSENT` evaluation, `app/workers/attendance_cutoff.py` tenant runner) |
| **#41** | **M15** | `feat(M15): Employee Self-Service (ESS) Personal Attendance & Shift APIs` | ✅ **DONE on branch** (`app/modules/ess/router.py`, `GET /api/v1/ess/calendar`, `GET /api/v1/ess/today`, `GET /api/v1/ess/shifts` with strict user scoping) |
| **#27** | **M11** | `feat(M11): Double-Entry Leave Ledger & Holiday Master for Attendance Rollup` | ✅ **DONE on branch** (`app/modules/leave/`, append-only `leave_transactions` ledger, `sandwiched_dates` evaluation, branch holiday calendar, session half-day) |
| **#28** | **M17** | `feat(M17): Statutory Muster Roll & Attendance Registers` | ✅ **DONE on branch** (`app/modules/muster/`, `GET /api/v1/muster/lines`, monthly aggregation of attendance + leave codes without wage pollution) |
| **SEC-01/03** | **Sec** | `DPDP Biometric Consent Ledger & PII Unmask Audit` | ✅ **DONE on branch** (`app/modules/privacy/`, `consent_events` ledger, `pii_access_audits` tracking unmasking of PAN/Aadhaar/Bank) |
| **CAP-02** | **Edge** | `Edge Sync Agent Local Buffer` | ✅ **DONE on branch** (`backend/edge_agent/buffer.py`, SQLite queue with 7-day retention sweep) |

---

### ⏳ Pending (Open & Not Yet Implemented)

#### Frontend Operator UI Track (Wave B)
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#33** | **Core UI** | `feat(ui-core): Enterprise AppShell, Theme Switcher & Common UI Kit` | ⏳ Pending |
| **#34** | **M04** | `feat(ui-M04): Employee Master UI — Directory, Masked PII Vault & Onboarding Form` | ⏳ Pending |
| **#35** | **M07** | `feat(ui-M07): Shift Templates UI — Multi-Session Configuration & Timing Bands` | ⏳ Pending |
| **#36** | **M08** | `feat(ui-M08): Roster & Shift Assignment UI — 30-Day Calendar & N67 Overrides` | ⏳ Pending |
| **#37** | **M09** | `feat(ui-M09): Punch Stream & Device Ingest UI — Live Stream & CSV Import` | ⏳ Pending |
| **#38** | **M10** | `feat(ui-M10): Daily Attendance Rollup & Human-Friendly Trace Inspector UI` | ⏳ Pending |

#### Policy, Overtime & Field Track (Wave E & D)
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#25** | **M06/M07** | `feat(M06/M07): Shift Attendance Policy Master — policy-linked shift templates` | ⏳ Pending |
| **#39** | **M06/M18** | `feat(M06/M18): Work Modes (WFH / On-Duty) & Mode-Gated Policy Controls` | ⏳ Pending |
| **#31** | **M12** | `feat(M12): Overtime (OT) Verification, Approval Workflow & Comp-Off Ledger` | ⏳ Pending |
| **#29** | **M16** | `feat(M16): Biometric Device Telemetry, Heartbeat & Edge Agent Ingestion Monitor` | ⏳ Pending (Buffer on branch; Cloud monitor pending) |
| **#32** | **M19** | `feat(M19): Mobile Geofenced Punch & Branch Geofence Registry` | ⏳ Pending |

#### Platform Administration (Wave F)
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#24** | **M02** | `feat(M02): Feature Flags Module — Tenant-Scoped Toggles & Canary Rollouts` | ⏳ Pending |
| **#23** | **M01** | `feat(M01): Super Admin & Tenant Provisioning, Plans, MAU Billing & Lifecycle UI` | ⏳ Pending |

---

### 🔍 Gaps / Not Raised in GitHub (Candidates for Future Issues)

1. **`feat(M16-Agent): Edge Sync Agent On-Premise TCP 4370 Polling Daemon`**
   * *Status:* The SQLite queue buffer (`backend/edge_agent/buffer.py`) is complete on `feat/leave-and-muster`, but the standalone on-premise service that polls ZKTeco/eSSL hardware over LAN port 4370 and uploads punches via HTTP is not issued.
2. **`feat(M17-Export): Statutory Muster Roll File Download (Excel / CSV / Printable PDF)`**
   * *Status:* Issue #28 delivers the raw matrix API (`/api/v1/muster/lines`). Generating downloadable Excel/PDF artifacts with statutory headers (Form 25 / Form II / Form T) can be a dedicated enhancement.
3. **`feat(ui-leave-regularization): Leave & Regularization Operator UI`**
   * *Status:* UI for supervisors to view and approve leave applications and regularization requests.
4. **`feat(ui-ess): Employee Self-Service Mobile Web Portal UI`**
   * *Status:* Frontend view for workers to view personal attendance calendar, today's punches, and submit requests using the `/api/v1/ess/` endpoints.

---

## 3. Recommended Sequential Next Steps

```
Step 1: Land `feat/leave-and-muster` into `main`
        ├── Merges cleanly with 0 conflicts (migrations 011 and 012 sequence after 010).
        └── Immediately resolves #26, #27, #28, #40, and #41 on the backend.

Step 2: Build Operator UI Foundation (Wave B)
        ├── #33: Enterprise AppShell & Theme Switcher
        ├── #34: Employee Master UI (with PII unmask audit integration)
        ├── #35: Shift Templates UI
        ├── #36: Roster & Shift Assignment UI
        ├── #37: Punch Stream & Ingestion UI
        └── #38: Attendance Rollup & Human-Friendly Trace Inspector UI

Step 3: Complete Policy & Overtime Gating (Wave E)
        ├── #25: Policy Master
        ├── #39: WFH & Work Modes
        └── #31: Overtime Verification & Comp-Off Ledger

Step 4: Hardware & Field Capture (Wave D)
        ├── #29: Device Telemetry & Heartbeat Monitor
        └── #32: Mobile Geofence Registry & Punch
```

---

## 4. Verification & Quality Gates

```powershell
# 1. Run all backend tests (including new attendance foundation and leave tests)
$env:DATABASE_URL="postgresql+asyncpg://apms_app:apms_app@localhost:5432/apms"
$env:DATABASE_URL_MIGRATE="postgresql+asyncpg://apms:apms@localhost:5432/apms"
$env:JWT_SECRET="dev-only-secret-minimum-32-bytes-long!"
python -m pytest backend/tests -v

# 2. Run frontend type check and production build
cd frontend; npm run build

# 3. Verify git tree hygiene
git status --short
```
