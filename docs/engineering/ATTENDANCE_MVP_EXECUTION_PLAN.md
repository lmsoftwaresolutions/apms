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

#### Frontend Operator & ESS UI Track (Wave B)
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#33** | **Core UI** | `feat(ui-core): Enterprise AppShell, Theme Switcher & Common UI Kit` | ⏳ Pending |
| **#34** | **M04** | `feat(ui-M04): Employee Master UI — Directory, Masked PII Vault & Onboarding Form` | ⏳ Pending |
| **#35** | **M07** | `feat(ui-M07): Shift Templates UI — Multi-Session Configuration & Timing Bands` | ⏳ Pending |
| **#36** | **M08** | `feat(ui-M08): Roster & Shift Assignment UI — 30-Day Calendar & N67 Overrides` | ⏳ Pending |
| **#37** | **M09** | `feat(ui-M09): Punch Stream & Device Ingest UI — Live Stream & CSV Import` | ⏳ Pending |
| **#38** | **M10** | `feat(ui-M10): Daily Attendance Rollup & Human-Friendly Trace Inspector UI` | ⏳ Pending |
| **#45** | **UI / Ops**| `feat(ui-leave-regularization): Leave & Regularization Operator UI` | ⏳ Pending |
| **#46** | **UI / ESS**| `feat(ui-ess): Employee Self-Service Mobile Web Portal UI` | ⏳ Pending |

#### Reporting & Export Track
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#44** | **M17** | `feat(M17-Export): Statutory Muster Roll File Download (Excel / CSV / Printable PDF)` | ⏳ Pending |

#### Policy, Overtime & Field Track (Wave E & D)
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#25** | **M06/M07** | `feat(M06/M07): Shift Attendance Policy Master — policy-linked shift templates` | ⏳ Pending |
| **#39** | **M06/M18** | `feat(M06/M18): Work Modes (WFH / On-Duty) & Mode-Gated Policy Controls` | ⏳ Pending |
| **#31** | **M12** | `feat(M12): Overtime (OT) Verification, Approval Workflow & Comp-Off Ledger` | ⏳ Pending |
| **#32** | **M19** | `feat(M19): Mobile Geofenced Punch & Branch Geofence Registry` | ⏳ Pending |
| **#29** | **M16** | `feat(M16): Biometric Device Telemetry, Heartbeat & Edge Agent Ingestion Monitor` | ⏸️ **Deferred / Pending (Not Needed Now)** |

#### Platform Administration (Wave F)
| Issue | Target Module | Scope | Status |
|---|---|---|---|
| **#24** | **M02** | `feat(M02): Feature Flags Module — Tenant-Scoped Toggles & Canary Rollouts` | ⏳ Pending |
| **#23** | **M01** | `feat(M01): Super Admin & Tenant Provisioning, Plans, MAU Billing & Lifecycle UI` | ⏳ Pending |

---

### 🔍 Deferred & Gap Analysis Status

1. **#29 / M16 Biometric Device Telemetry & Edge Agent Hardware Daemon**:
   - **Status:** **Deferred / Pending (Not Needed in Current Phase)** per Product Owner decision.
   - **Rationale:** Factory hardware telemetry daemons and physical edge heartbeat monitors are deferred until software-first attendance, leave, regularization, statutory muster export, and operator/ESS UI workflows are fully established and operational.
2. **Newly Raised Enhancements (Active in Backlog)**:
   - **#44**: `feat(M17-Export): Statutory Muster Roll File Download (Excel / CSV / Printable PDF)`
   - **#45**: `feat(ui-leave-regularization): Leave & Regularization Operator UI`
   - **#46**: `feat(ui-ess): Employee Self-Service Mobile Web Portal UI`

---

## 3. Recommended Sequential Next Steps

```
Step 1: Land Backend Foundations into `main`
          ├── Merge `origin/feat/leave-and-muster` (which subsumes `origin/feat/attendance-mvp-foundation`)
          ├── Lands Wave A (#26, #40, #41, SEC-01/03, CAP-02, Migration 011)
          └── Lands Wave C (#27, #28, Migration 012) cleanly with 0 conflicts.

Step 2: Execute Frontend UI & ESS Tracks
          ├── Wave B1 (Core AppShell & Masters):
          │     ├── #33: Enterprise AppShell, Theme Switcher & Common UI Kit
          │     ├── #34: Employee Master UI (Directory, Masked PII Vault, Form)
          │     ├── #35: Shift Templates UI (Multi-Session Bands, Break Config)
          │     └── #36: Roster & Shift Assignment UI (30-Day Grid & Overrides)
          ├── Wave B2 (Attendance & Daily Operations):
          │     ├── #37: Punch Stream & Ingestion UI (Live Stream & CSV Ingest)
          │     ├── #38: Attendance Rollup & Human-Friendly Trace Inspector UI
          │     └── #45: Leave & Regularization Operator UI (Supervisor Approvals)
          └── Wave B3 (Worker Self-Service):
                └── #46: Employee Self-Service (ESS) Mobile Web Portal UI

Step 3: Export & Statutory Reporting Enhancements
          └── #44: Statutory Muster Roll File Download (Excel / CSV / Printable PDF Form 25 / Form II)

Step 4: Advanced Policies & Mobility (Waves D & E)
          ├── #25: Shift Attendance Policy Master (M06/M07 policy linking)
          ├── #39: Work Modes (WFH / On-Duty) & Mode-Gated Policy Controls
          ├── #31: Overtime Verification, Approval Workflow & Comp-Off Ledger
          └── #32: Mobile Geofenced Punch & Branch Geofence Registry

Deferred (Hardware Track):
          └── #29: M16 Biometric Device Telemetry, Heartbeat & Edge Agent Ingestion Monitor (Pending/Deferred)
```
