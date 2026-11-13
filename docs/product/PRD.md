# APMS Product Requirements Document (PRD)

## 1. Product Overview & Purpose

APMS is an enterprise-grade multi-tenant SaaS application that unifies workforce scheduling, multi-source attendance tracking, leave management, and statutory payroll into a coherent, highly reliable system.

The core objective is to eliminate error-prone manual spreadsheets, solve complex blue-collar and white-collar scheduling anomalies (such as split shifts, overnight shifts, and multi-session teaching blocks), and guarantee 100% statutory payroll compliance with complete auditability.

---

## 2. Target Personas & Primary User Journeys

### 2.1 Persona Definitions
1. **Tenant Administrator (`ADM`)**: Manages organizational master data, branches, departments, security policies, and subscription settings.
2. **HR Operations & Payroll Executive (`HRO`)**: Configures pay groups, executes the 10-step payroll wizard, generates bank transfer files, handles attendance regularizations, and manages muster rolls.
3. **Shift Supervisor / Department Head (`MGR`)**: Allocates roster patterns, executes ad-hoc same-day shift changes, approves leaves, and verifies overtime pre-authorizations.
4. **Employee (`EMP`)**: Clocks in/out via mobile or biometric hardware, tracks daily worked duration, checks leave balances, requests shift swaps, regularizes missed punches, and downloads payslips.
5. **System Integrator / Device Admin (`DEV_ADM`)**: Registers hardware biometrics, monitors Edge Sync Agents, reviews raw punch payloads, and diagnoses communication failures.

### 2.2 Primary User Journeys

#### Journey 1: Monthly Payroll Execution (HR Operations)
1. **Initiate Pay Run**: HR selects tenant, Pay Group, and target pay period (e.g., Nov 1 to Nov 30).
2. **Step 1: Attendance Reconciliation**: System identifies unfinalized attendance records, pending regularization requests, and single-punch anomalies.
3. **Step 2: Leave & Holiday Freeze**: Snapshot active leave balances and verify sandwich rule deductions.
4. **Step 3: Variable Earnings & Deductions**: Upload or pull ad-hoc components (bonuses, advance repayments, meal deductions).
5. **Step 4: Overtime Authorization**: Verify manager-approved overtime hours against policy caps.
6. **Step 5: Gross Salary Computation**: Calculate base salary, allowances, and per-session lecture fees.
7. **Step 6: Statutory Deductions**: Execute deterministic EPF, ESI, Professional Tax, and TDS calculations.
8. **Step 7: Pre-Payroll Audit & Variance Check**: System flags outliers (>20% salary variation from prior month).
9. **Step 8: Final Lock & Ledger Post**: Pay run is locked; immutable snapshots are generated.
10. **Step 9: Disbursement Artifacts**: Generate bank NEFT/RTGS batch files and statutory returns.
11. **Step 10: Payslip Release**: Securely publish encrypted digital payslips to Employee Self-Service (ESS).

#### Journey 2: Punch Ingestion to Attendance Status (Engine Workflow)
1. Biometric device pushes punch to APMS API (`POST /api/v1/devices/push`) or Edge Agent relays buffered punches.
2. Punch is recorded in immutable `raw_envelope` and normalized into `punch_event`.
3. Background task identifies employee's active `dated_shift_instance` for the day.
4. Session-aware pairing evaluates In/Out bounds, grace periods, and break policies.
5. Daily rollup calculates worked duration, missed duration, and assigns status (`PRESENT`, `HALF_DAY`, `ABSENT`).
6. Immutable `attendance_explanation_trace` records exact rule evaluations.

---

## 3. High-Level Functional Modules

| Module ID | Module Name | Scope & Responsibilities | Key Traceability IDs |
| :--- | :--- | :--- | :--- |
| **M1** | Organization & IAM | Multi-tenancy, RBAC, branches, departments, designations, employee master | `PLT-*`, `IAM-*`, `ORG-*`, `EMP-*` |
| **M2** | Device & Ingestion | Hardware protocols, ADMS, Edge Sync Agent, raw punch storage, file import | `DEV-*`, `PCH-*` |
| **M3** | Shifts & Roster | Shift templates, rotation cycles, dated shift instances, ad-hoc changes | `SHF-*`, `ROS-*` |
| **M4** | Punch Pairing | Session-aware pairing, overnight attribution, deduplication, anomalies | `ATT-01` to `ATT-08` |
| **M5** | Attendance Engine | Daily rollup, policy bands, half-day/absent assignment, explanation trace | `ATT-09` to `ATT-18` |
| **M6** | Leave & Holidays | Leave types, append-only ledgers, sandwich rules, holiday calendars | `LVE-*`, `HOL-*` |
| **M7** | Payroll Engine | 10-step wizard, salary structures, statutory engine (EPF/ESI/PT/TDS), payslips | `PAY-*`, `PSL-*`, `STA-*` |
| **M8** | Reporting & Audit | Form 25 muster rolls, statutory returns, audit trails, Tally XML export | `RPT-*` |
| **M9** | Workflow & Engine | Multi-level approval chains, delegation, SLA escalation, notifications | `WFL-*`, `NTF-*` |

---

## 4. Key Non-Functional Requirements (NFRs)

1. **Multi-Tenancy & Data Privacy (`NFR-SEC-01`)**:
   - Zero cross-tenant data leakage guaranteed by database-level Row-Level Security (RLS) on PostgreSQL 16+.
   - Tenant context must be injected strictly via authenticated session claims (`app.current_tenant_id`).
2. **Ingestion Throughput & Scalability (`NFR-PERF-01`)**:
   - Ingestion API must sustain up to 10,000 raw punches/minute with response latency < 200ms.
   - Idempotent deduplication using payload hash keys (`sha256(tenant_id, device_id, raw_payload)`).
3. **Auditability & Traceability (`NFR-AUD-01`)**:
   - Every attendance status calculation and payroll run must persist an immutable JSON explanation trace.
   - System must provide full point-in-time reconstruction of employee attendance records.
4. **Availability & Resilience (`NFR-REL-01`)**:
   - 99.9% uptime target.
   - Offline-capable Edge Agent buffers punches up to 7 days during internet outages and safely relays upon reconnect.
5. **Regulatory Compliance (`NFR-REG-01`)**:
   - Full compliance with Indian DPDP Act 2023 for PII consent, purpose limitation, and right to erasure/masking.
   - Audit trail retention for minimum 8 statutory fiscal years.

