# APMS SaaS Vision & Product Strategy

## 1. Executive Summary

**APMS (Automated Payroll & Attendance Management System)** is a modern, enterprise-grade, multi-tenant B2B SaaS platform engineered to solve the most difficult, mission-critical operational challenges in workforce management: **complex shift scheduling, multi-device attendance processing, configurable leave policies, and fully compliant, audit-ready payroll execution**.

Traditional HRMS platforms either cater to white-collar 9-to-5 knowledge workers or act as rigid desktop utilities tied to local biometric machines. APMS bridges this divide by delivering an **industrial-strength, modular monolith architecture** capable of handling diverse workforce archetypes—from 24/7 manufacturing plants, multi-specialty hospitals, and multi-branch coaching institutes to distributed retail chains, security guard deployments, and IT software enterprises.

---

## 2. Core Value Proposition

1. **Deterministic Attendance Engine**:
   - High-throughput punch ingestion with idempotency and hash chaining.
   - Intelligent multi-session pairing, overnight shift boundary attribution, grace/late-coming tolerance, and transparent audit explanation traces.
2. **Flexible Shift & Roster Lifecycle**:
   - Support for fixed, rotating, split/multi-session, continuous 24/7, and open/unassigned shifts.
   - Deterministic shift generation with immutable dated instances and full audit history of ad-hoc same-day modifications.
3. **Statutory & Flexible Payroll Processing**:
   - Guided 10-step wizard for monthly pay runs with automated pre-run reconciliation.
   - Comprehensive Indian statutory compliance out-of-the-box (EPF, ESI, Professional Tax, TDS Section 115BAC/Old Regime, Labour Welfare Fund).
   - Extensible for international statutory engines via Tenant Localization Packs.
4. **Universal Device & Connector Interoperability**:
   - Native integration with biometric devices (ZKTeco ADMS, eTimeOffice/push SDKs), mobile punch with geofencing & geofencing validation, edge synchronization agents for offline factory sites, and secure file bulk import.
5. **Multi-Tenant Security & Strict Isolation**:
   - Shared-database multi-tenancy backed by PostgreSQL Row-Level Security (RLS) on every table.
   - Field-level AES-256 envelope encryption for sensitive PII/bank details.
   - Full compliance with the Digital Personal Data Protection Act (DPDP Act 2023).

---

## 3. Architectural Tenets & Invariants

APMS is governed by ten core architectural invariants that guide all design and development:

1. **Row-Level Security (RLS) on Every Tenant Table**:
   No query or migration may omit `tenant_id`. Every tenant-scoped table enforces PostgreSQL RLS with `current_setting('app.current_tenant_id', true)`.
2. **Immutable Raw Ingestion**:
   Raw punches (`raw_envelope`, `punch_event`) are strictly append-only. Device payloads are stored unmodified; normalization never mutates raw records.
3. **Attendance is Separate from Payroll**:
   The attendance engine evaluates worked duration, session completeness, and attendance status. The payroll engine consumes finalized attendance summaries as inputs for salary calculation; attendance never directly modifies salary ledgers.
4. **Deterministic Calculation & Explanation Trace**:
   Every attendance calculation and payroll run must produce an immutable explanation trace explaining exact rule inputs, policy bands, and intermediate formulas.
5. **Explicit Dated Shift Instances**:
   Roster patterns expand into immutable dated shift instances (`dated_shift_instance`). Same-day ad-hoc changes modify the specific date's instance without altering master recurring templates.
6. **Double-Entry Leave Ledger**:
   Leave balances are never stored as mutable scalar numbers. All accruals, applications, lapses, and encashments are append-only transaction entries with running balances.
7. **Multi-Session Mid-Shift Gap Exclusion**:
   Mid-shift gaps between scheduled sessions (e.g., in split shifts) are strictly non-working intervals and excluded from worked duration and overtime calculations.
8. **Statutory Non-Negotiables**:
   EPF wage ceilings, ESI gross thresholds, and statutory caps are strictly governed by effective-dated statutory tables, preventing hardcoded formulas.
9. **Idempotent Background Jobs**:
   All background jobs (punch processing, shift instantiation, daily rollup, payroll reconciliation) must accept idempotent keys and support safe retries without data corruption.
10. **Device Ingestion Resilience**:
    Device push failures, network splits, and delayed punches are accommodated through out-of-order punch processing and automatic daily recalculation triggers.

---

## 4. Target Market & User Personas

### 4.1 Target Industry Verticals
- **Manufacturing & Heavy Industry**: Multi-shift factories, overnight shifts, overtime pre-approvals, break-time tracking, punch rounding rules, contractor payroll.
- **Healthcare & Hospitals**: Continuous 24/7 emergency rosters, multi-day shifts, cross-midnight attribution, doctor on-call allowances, locum per-session payouts.
- **Education & Coaching Institutes**: Split shifts (morning + evening lecture sessions), faculty per-lecture pay, academic holiday calendars, student-schedule alignment.
- **Retail & Hospitality Chains**: Multi-branch rosters, floating employees, geofenced mobile attendance, split shifts, penalty bands for tardiness.
- **Information Technology & Professional Services**: Hybrid work policies, WFH quotas with automated approvals, flexible work hours, project-based cost center tagging.
- **Security & Facility Management**: Roster deployments across client sites, unassigned/open shifts, replacement guard workflows, minimum wage compliance.

### 4.2 Key System Personas
- **Tenant Super Admin / Owner**: Full organizational configuration, pay group creation, billing, subscription, security logs.
- **HR Operations / Payroll Manager**: Monthly pay run execution, attendance regularization reviews, leave policy adjustments, muster roll generation.
- **Department Head / Shift Supervisor**: Roster scheduling, ad-hoc same-day shift reassignments, overtime authorisations, leave approvals.
- **Employee (ESS - Web & Mobile)**: Clock-in/out via mobile geofence, view attendance calendar, apply for leave/regularization, download digital payslips.
- **Device Administrator**: Hardware provisioning, biometric device mapping, Edge Sync Agent monitoring.

---

## 5. Technology Stack Summary

| Layer | Selected Technology | Architecture Decision |
| :--- | :--- | :--- |
| **Backend Framework** | Python 3.12+ / FastAPI | High-performance asynchronous API, Pydantic v2 validation, OpenAPI auto-spec |
| **Database** | PostgreSQL 16+ | Native Row-Level Security (RLS), declarative table partitioning, JSONB for rule policies |
| **Database ORM & Migrations** | SQLAlchemy 2.0 (async) + Alembic | Strict type annotations, session connection hooks setting `app.current_tenant_id` |
| **Task Queue & Cache** | Redis 7+ / Celery or ARQ | Asynchronous punch batching, distributed locks, daily rollups, email/push dispatch |
| **Frontend Framework** | React 18+ / TypeScript / Vite | Tailwind CSS, Shadcn UI / Radix primitives, TanStack Query, React Hook Form |
| **Biometric Connector** | Python / Rust Edge Agent | Lightweight edge binary communicating with local device SDKs and push APIs |
| **Deployment & Hosting** | Docker / Docker Compose / Kubernetes | Profile XS/S modular monolith single-container deployment or split micro-container scale |

---

## 6. Strategic Milestones

- **Phase 0–1 (Foundation & Ingestion)**: Multi-tenant core, IAM, raw punch ingestion, Edge Agent, basic shift scheduling.
- **Phase 2 (Attendance Engine & Leave)**: Multi-session pairing, daily rollups, explanation trace, leave ledgers, holiday calendars.
- **Phase 3 (Payroll & Statutory Engine)**: 10-step wizard, statutory engine (EPF, ESI, PT, TDS), server-side payslips, muster rolls.
- **Phase 4 (Enterprise Hardening & GA)**: Shadow-run diff testing, advanced reporting, workflow engine with escalation, DPDP Act audit controls.
- **Phase 5 (Mobile & Field Expansion)**: Offline-first geofenced mobile app, geotracking, facial verification.

