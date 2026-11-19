# APMS Architecture Decision Register (ADR Index)

## 1. Overview

This register tracks all fundamental architectural, technology, and engineering decisions adopted in APMS. Each decision is documented with context, alternatives considered, chosen rationale, and consequences.

---

## 2. Architecture Decisions Index (ADR-01 to ADR-31)

| ADR ID | Decision Title | Status | Primary Technology / Pattern | Module |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-01** | Modular Monolith over Microservices | ACCEPTED | Single deployable unit with strictly decoupled domain boundaries | Core / Platform |
| **ADR-02** | Shared Database Multi-Tenancy with RLS | ACCEPTED | PostgreSQL Row-Level Security (`tenant_id`) | Database / Security |
| **ADR-03** | Python 3.12+ and FastAPI for Backend | ACCEPTED | Async REST API, Pydantic v2 schemas, OpenAPI specification | Backend Core |
| **ADR-04** | PostgreSQL 16+ as Primary Database | ACCEPTED | Native RLS, declarative partitioning, JSONB policy storage | Database |
| **ADR-05** | Append-Only Raw Punch Ingestion | ACCEPTED | `raw_envelope` $\rightarrow$ `punch_event` with SHA-256 payload hash | Device / Ingestion |
| **ADR-06** | Session-Aware Chronological Pairing | ACCEPTED | Match punches to dated shift session windows; not blind 24h | Attendance Engine |
| **ADR-07** | Attendance Decoupled from Payroll | ACCEPTED | Daily attendance ledger acts as input; payroll never mutates punches | Attendance / Payroll |
| **ADR-08** | Double-Entry Leave Ledger | ACCEPTED | Append-only transaction ledger (`leave_transaction`) | Leave Management |
| **ADR-09** | Guided 10-Step Pay Run Wizard | ACCEPTED | Step-by-step state machine with pre-run audit locks | Payroll Engine |
| **ADR-10** | React 18+ and Vite for Web Frontend | ACCEPTED | TypeScript, Tailwind CSS, TanStack Query, Radix UI primitives | Frontend |
| **ADR-11** | Redis and Celery/ARQ for Background Tasks | ACCEPTED | Distributed task queue for punch processing, rollups, reports | Background Queue |
| **ADR-12** | Local Python Edge Sync Agent | ACCEPTED | On-premises daemon buffering biometrics during network outages | Hardware Ingestion |
| **ADR-13** | Field-Level AES-256 Envelope Encryption | ACCEPTED | Encrypted bank accounts, Aadhaar, PAN, and salary fields | Security |
| **ADR-14** | Immutable Explanation Trace Storage | ACCEPTED | JSON audit trace for every daily rollup and payroll calculation | Audit / Compliance |
| **ADR-15** | Materialized Dated Shift Instances | ACCEPTED | Expand recurrence patterns into concrete daily shift instances | Shifts / Roster |
| **ADR-16** | Mid-Shift Gap Exclusion (N65) | ACCEPTED | Exclude intervals between scheduled sessions from worked duration | Attendance Engine |
| **ADR-17** | Duration Ratio Daily Rollup Default (N66a) | ACCEPTED | Map attendance status via worked-to-scheduled duration ratio | Attendance Engine |
| **ADR-18** | Session Minimum Presence Separation (N66b) | ACCEPTED | Separate session qualification from actual worked duration | Attendance Engine |
| **ADR-19** | Session-Targeted Half Leave Mapping (N66c) | ACCEPTED | Half-day leave targets First Half or Second Half session explicitly | Leave / Attendance |
| **ADR-20** | Cancelled-Paid Default for Salaried (N66d) | ACCEPTED | Full attendance credit for employer-cancelled sessions | Attendance / Shifts |
| **ADR-21** | Dual-Path Same-Day Modifications (N67) | ACCEPTED | Direct supervisor override or employee request with approval | Shifts / Roster |
| **ADR-22** | Needs-Review Default for Single Punches (Q4) | ACCEPTED | Single punch flags anomaly; manual punch or regularization | Attendance Engine |
| **ADR-23** | Auto-Approve WFH within Quota (Q6) | ACCEPTED | Instant auto-approval within monthly quota balance | Workflows / Leave |
| **ADR-24** | Approval-Gated Overtime Hours (N20) | ACCEPTED | Extra hours require manager approval before payroll credit | Overtime / Payroll |
| **ADR-25** | Indian Statutory Packs as Parameterized Tables | ACCEPTED | EPF, ESI, PT, TDS governed by versioned database tables | Payroll / Statutory |
| **ADR-26** | Server-Side Cryptographic Payslip PDFs | ACCEPTED | Headless HTML-to-PDF rendering with AES password protection | Payroll / Documents |
| **ADR-27** | DPDP Act 2023 Consent & Retention Engine | ACCEPTED | Biometric consent tracking, audit logs, and data masking | Privacy / Compliance |
| **ADR-28** | Declarative Table Partitioning on Ingestion | ACCEPTED | Monthly range partitioning on `raw_envelope` and `punch_event` | Database / Scale |
| **ADR-29** | Out-of-Order Punch Recalculation Triggers | ACCEPTED | Event-driven recalculation of affected daily attendance records | Attendance Engine |
| **ADR-30** | Antigravity-Native Agent Infrastructure | ACCEPTED | Workspace rules, domain skills, and specialized agents | Dev Infrastructure |
| **ADR-31** | Permission-keyed RBAC | PROPOSED | `{module}.{resource}.{action}` keys; roles are bundles; RLS remains isolation | IAM / M03 |

---

## 3. Product Decision Links

- **N65**: Minimum Gap Threshold and Multi-Session Classification $\rightarrow$ See `ADR-16` and `BUSINESS_RULES.md#BR-ATT-02`.
- **N66a**: Daily Rollup Mode & Threshold Bands $\rightarrow$ See `ADR-17` and `BUSINESS_RULES.md#BR-ROL-01`.
- **N66b**: Session Minimum-Presence Eligibility $\rightarrow$ See `ADR-18` and `BUSINESS_RULES.md#BR-ROL-03`.
- **N66c**: Half-Day / Partial Leave Mapping $\rightarrow$ See `ADR-19` and `BUSINESS_RULES.md#BR-ROL-04`.
- **N66d**: Employer-Cancelled Sessions $\rightarrow$ See `ADR-20` and `BUSINESS_RULES.md#BR-ROL-05`.
- **N67**: Ad-Hoc Same-Day Schedule Modifications $\rightarrow$ See `ADR-21` and `BUSINESS_RULES.md#BR-ROL-06`.

