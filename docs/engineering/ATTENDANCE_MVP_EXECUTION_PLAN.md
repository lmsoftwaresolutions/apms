# APMS — Attendance MVP Sequential Implementation Plan

> **Normative Roadmap.** Defines the dependency-ordered, step-by-step execution plan for the APMS Attendance MVP (Phase 1 through Phase 5).  
> **Master Reference:** [`CONTEXT.md`](../../CONTEXT.md) · **Requirements:** [`docs/product/SRS.md`](../product/SRS.md) · **Formulas:** [`docs/requirements/BUSINESS_RULES.md`](../requirements/BUSINESS_RULES.md)

---

## 1. Branch Strategy & Current Status

* **`main` Branch (Base):** Contains core IAM, Branches, Departments, Designations, Employees/PII Vault, Shifts, Roster, Punch Ingestion, and Attendance Engine (all 70 tests passing).
* **`origin/feat/attendance-mvp-foundation` (Wave A):**
  - **Can it be merged?** **YES, 100% cleanly with 0 conflicts.**
  - Implements **#26** (Regularization), **#40** (Cutoff Absent Worker), **#41** (ESS Personal APIs), **SEC-01/03** (Biometric Consent Ledger & PII Unmask Audit), and **CAP-02** (Edge Agent SQLite Buffer) behind migration `011_attendance_foundation.py`.
* **`origin/feat/leave-and-muster` (Wave A + Wave C):**
  - **Can it be merged?** **YES, 100% cleanly with 0 conflicts.**
  - **Direct superset of `feat/attendance-mvp-foundation`:** Contains everything in `feat/attendance-mvp-foundation` **plus** Wave C: **#27** (Double-Entry Leave Ledger & Holidays) and **#28** (Statutory Muster Roll) behind migration `012_leave_and_muster.py`.

---

## 2. Complete Issue Status Matrix

### ✅ Implemented on Remote Branches

| Issue | Module | Title | Implemented Branch | Artifacts Delivered |
|---|---|---|---|---|
| **#26** | **M18** | `feat(M18): Attendance Regularization & Missing Punch Correction` | Both branches | `app/modules/regularizations/`, `regularization_requests` table with RLS, review/approve endpoint, synthetic punch generation, auto-recalc. |
| **#40** | **M10** | `feat(M10): Scheduled End-of-Day Attendance Rollup Worker` | Both branches | `app/modules/attendance/cutoff.py`, overnight post-window wait, zero-punch `ABSENT` evaluation, `app/workers/attendance_cutoff.py` tenant runner. |
| **#41** | **M15** | `feat(M15): Employee Self-Service (ESS) Personal Attendance APIs` | Both branches | `app/modules/ess/router.py`, `GET /api/v1/ess/calendar`, `GET /api/v1/ess/today`, `GET /api/v1/ess/shifts` with strict user scoping. |
| **SEC-01/03**| **Sec** | `DPDP Biometric Consent Ledger & PII Unmask Audit` | Both branches | `app/modules/privacy/`, `consent_events` ledger, `pii_access_audits` tracking unmasking of PAN/Aadhaar/Bank. |
| **CAP-02** | **Edge** | `Edge Sync Agent Local Buffer` | Both branches | `backend/edge_agent/buffer.py`, SQLite queue with 7-day retention sweep. |
| **#27** | **M11** | `feat(M11): Double-Entry Leave Ledger & Holiday Master` | `feat/leave-and-muster` | `app/modules/leave/`, append-only `leave_transactions` ledger, `sandwiched_dates` evaluation, branch holiday calendar, session half-day. |
| **#28** | **M17** | `feat(M17): Statutory Muster Roll & Attendance Registers` | `feat/leave-and-muster` | `app/modules/muster/`, `GET /api/v1/muster/lines` monthly aggregation of attendance + leave codes without wage pollution. |

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

### 🔍 Gaps / Not Raised in GitHub

1. **`feat(M16-Agent): Edge Sync Agent On-Premise TCP 4370 Polling Daemon`**: The SQLite buffer (`backend/edge_agent/buffer.py`) is complete on the branches, but the local daemon that connects to hardware over LAN port 4370 and uploads to `/api/v1/punches/ingest` is not issued.
2. **`feat(M17-Export): Statutory Muster Roll File Download (Excel / CSV / Printable PDF)`**: #28 delivers raw JSON matrix lines (`/api/v1/muster/lines`). Generating formatted Excel/PDF statutory downloads (Form 25 / Form II / Form T) can be a separate export enhancement.
3. **`feat(ui-leave-regularization): Leave & Regularization Operator UI`**: UI for supervisors to view and approve leave applications and regularization requests.
4. **`feat(ui-ess): Employee Self-Service Mobile Web Portal UI`**: Front-end view for workers to view personal attendance calendar, today's punches, and submit requests using the `/api/v1/ess/` endpoints.

---

## 3. Recommended Sequential Next Steps

```
Option 1: Merge `origin/feat/leave-and-muster` directly
          ├── It already contains all commits from `feat/attendance-mvp-foundation`!
          ├── Merges cleanly into `main` with 0 conflicts.
          └── Lands Wave A (#26, #40, #41, SEC-01/03, CAP-02) AND Wave C (#27, #28) together!

Option 2: Merge in two progressive steps
          ├── Step A: Merge `origin/feat/attendance-mvp-foundation` (Lands Wave A, migration 011).
          └── Step B: Merge `origin/feat/leave-and-muster` (Lands Wave C, migration 012).

Next: Execute Operator UI (Wave B)
          ├── #33: Enterprise AppShell & Theme Switcher
          ├── #34: Employee Master UI
          ├── #35: Shift Templates UI
          ├── #36: Roster & Shift Assignment UI
          ├── #37: Punch Stream & Ingestion UI
          └── #38: Attendance Rollup & Human-Friendly Trace Inspector UI
```
