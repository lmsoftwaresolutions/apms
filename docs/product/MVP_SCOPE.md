# APMS MVP Scope & Release Roadmap

## 1. Scope Governance Principles

To ensure predictable delivery, rigorous code quality, and immediate enterprise utility, APMS features are phased strictly according to operational dependencies. Foundational data models, multi-tenancy isolation, and raw punch ingestion must be thoroughly verified before payroll calculations are built on top.

---

## 2. Release Matrix

| Capability Area | Core MVP (Phase 0–3) | Phase 4 (GA & Hardening) | Phase 5 (Mobile & Field) | Phase 6 (Enterprise AI) |
| :--- | :--- | :--- | :--- | :--- |
| **Multi-Tenancy & IAM** | PostgreSQL RLS, RBAC, Tenant isolation, Org hierarchy | Audit trail exporter, Role delegation | Mobile biometric sign-in | SAML 2.0 / OIDC SSO, SCIM provisioning |
| **Shift & Roster** | Fixed, rotating, multi-session, overnight shifts, dated instances, ad-hoc changes | Roster conflict warnings, auto-swap approvals | Self-service shift trade in mobile | AI roster auto-scheduling, fatigue detection |
| **Punch Ingestion** | ADMS push API, Edge Agent local sync, CSV/Excel file import | Biometric health ping, duplicate blast suppression | Mobile GPS geofenced clock-in, mock location check | CCTV camera facial recognition ingestion |
| **Attendance Engine** | Session pairing, daily rollup (DURATION_RATIO), explanation trace | Overtime auto-credit rules, flexi-hour banks | Offline mobile punches with sync | Anomaly detection for buddy punching |
| **Leave & Holidays** | Double-entry ledger, leave types, sandwich rules, holiday calendars | Accrual rules engine, compensatory off granting | Mobile leave requests & status | Predictive leave forecasting |
| **Payroll Engine** | 10-step wizard, Indian statutory pack (EPF, ESI, PT, TDS), PDF payslips | Arrears calculation engine, Tally XML export | Mobile payslip viewer & tax projection | Multi-country statutory localization packs |
| **Workflows** | Single-level and 2-level approvals for leave & regularization | SLA-based auto-escalation, reminder notifications | In-app mobile push notifications | Slack / MS Teams interactive approval bots |

---

## 3. Core MVP (Phases 0–3) Detailed Deliverables

### In-Scope for Core MVP
1. **Multi-Tenant Foundation (`M1`)**:
   - PostgreSQL Row-Level Security (`app.current_tenant_id`) enforced across all tenant tables.
   - Core organizational models: Tenant, Branch, Department, Designation, Pay Group, Employee Master.
2. **Device & Ingestion Engine (`M2`)**:
   - Universal Push Ingestion endpoint (`POST /api/v1/devices/push`) handling ADMS/eTimeOffice payloads.
   - Raw immutable storage (`raw_envelope` and `punch_event`).
   - Python-based Edge Sync Agent for local network biometrics.
   - Robust CSV/Excel punch file upload for legacy fallbacks.
3. **Shift & Roster Management (`M3`)**:
   - Shift Templates: Fixed, Overnight, Multi-session (split shifts), Flexible.
   - Roster generation creating immutable `dated_shift_instance` records.
   - Confirmed `N67` dual-path ad-hoc same-day shift changes (direct supervisor override + employee request).
4. **Attendance Calculation Engine (`M4`, `M5`)**:
   - Session-aware chronological punch pairing with out-of-order punch handling.
   - Break policy handling: mid-shift gap exclusions (`N65`).
   - Daily rollup mode: `DURATION_RATIO` default with session minimum presence (`N66a`, `N66b`).
   - Session-targeted half-day leave mapping (`N66c`).
   - Employer-cancelled session treatment (`N66d`).
   - Confirmed `Q4` single punch anomaly defaulting to `NEEDS_REVIEW`.
   - Immutable JSON explanation trace persisted with every daily attendance record.
5. **Leave & Holiday System (`M6`)**:
   - Immutable double-entry leave transaction ledger (`leave_transaction`).
   - Standard leave types: Earned Leave (EL), Casual Leave (CL), Sick Leave (SL), Loss of Pay (LOP).
   - Configurable sandwich rule evaluation for weekly offs and holidays.
6. **Payroll Engine & Statutory Compliance (`M7`)**:
   - 10-step guided pay run wizard with pre-payroll reconciliation.
   - Indian statutory deductions:
     - Employees' Provident Fund (EPF) with wage ceiling limit (₹15,000 default).
     - Employees' State Insurance (ESI) with gross ceiling (₹21,000 default).
     - State-specific Professional Tax (PT) slab computation.
     - Income Tax (TDS) under Section 115BAC (New Regime) and Old Regime.
   - Server-side cryptographic PDF payslip generation.
   - Bank transfer file generation (standard NEFT/RTGS CSV format).
7. **Basic Reporting (`M8`)**:
   - Monthly Muster Roll (Form 25 format).
   - Daily attendance summary report.
   - Statutory deduction contribution summaries.

### Explicitly Out-of-Scope for Core MVP
- Enterprise SAML/OIDC SSO and SCIM 2.0 provisioning (deferred to Phase 6).
- Native mobile apps for iOS/Android (deferred to Phase 5).
- Camera stream facial recognition ingestion (deferred to Phase 6).
- International statutory payroll engines outside India (deferred to Phase 6).
- AI-driven automated shift optimization (deferred to Phase 6).

---

## 4. MVP Acceptance Criteria (Definition of Done)

1. **Isolation Guarantee**: Zero cross-tenant data leakage across all unit and integration test suites.
2. **Ingestion Reliability**: 100% of pushed device punches safely recorded in `raw_envelope` without drops under simulated network disconnects.
3. **Calculation Determinism**: Re-running attendance or payroll over identical historical punches produces identical results.
4. **Statutory Accuracy**: Payroll calculations match manual chartered accountant test vectors to the exact paisa (±₹0.00).
5. **Traceability**: Every attendance record has an associated `attendance_explanation_trace` explaining punch-to-session assignment.

