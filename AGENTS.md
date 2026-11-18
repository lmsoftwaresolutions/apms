# APMS — Agent Development & System Instructions

## 1. Product Overview
**APMS (Automated Payroll & Attendance Management System)** is an enterprise multi-tenant B2B SaaS platform engineered for complex workforce scheduling, multi-device biometric attendance pairing, double-entry leave ledgers, and 100% compliant statutory payroll execution (India-first: EPF, ESI, PT, TDS).

---

## 2. Verified Technology Stack
- **Backend**: Python 3.12+, FastAPI (async), Pydantic v2.
- **Persistence**: PostgreSQL 16+ with Row-Level Security (RLS) on `tenant_id`, SQLAlchemy 2.0 (async), Alembic.
- **Task Queue & Cache**: Redis 7+, Celery or ARQ.
- **Frontend**: React 18+, TypeScript (strict), Vite, Tailwind CSS, TanStack Query, Radix UI.
- **Hardware Integration**: Local Python/Rust Edge Sync Agent, ZKTeco ADMS push, eTimeOffice HTTP.
- **Deployment**: Docker Compose (Profile XS/S combined) or multi-container Kubernetes (Profile M/L).

---

## 3. Core Architectural Invariants (Non-Negotiable)
1. **Row-Level Security (RLS)**: Every tenant-scoped table MUST have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Never query without setting `app.current_tenant_id`.
2. **Immutable Raw Ingestion**: `raw_envelope` and `punch_event` are strictly append-only. Never modify or delete raw punches.
3. **Attendance is Separate from Payroll**: Daily attendance ledger acts as read-only input to payroll. Payroll never alters raw punches.
4. **Deterministic Calculation & Trace**: Every attendance record and pay run MUST persist an immutable JSON explanation trace.
5. **Double-Entry Leave**: Leave balances are derived from append-only `leave_transactions` ledgers, never stored as mutable scalar numbers.
6. **Multi-Session Gap Exclusion (N65)**: Intervals between scheduled sessions are strictly non-working time, excluded from worked hours and OT.
7. **Statutory Non-Negotiables**: EPF, ESI, and PT ceilings are versioned in database tables, never hardcoded in application logic.
8. **Idempotent Background Tasks**: All background tasks must accept idempotency keys and support safe retries.

---

## 4. Documentation Navigation & Progressive Disclosure
When assigned a task, load documentation on-demand using progressive disclosure:
- **Product & Scope**: Consult `docs/product/PRD.md` and `docs/product/MVP_SCOPE.md`.
- **Authoritative Business Rules**: Consult `docs/requirements/BUSINESS_RULES.md`.
- **Requirements & Traceability**: Consult `docs/requirements/REQUIREMENTS_CATALOG.md`.
- **Architecture Decisions**: Consult `docs/decisions/DECISION_REGISTER.md`.
- **Module Specifications**: Consult `docs/modules/<module>/SPEC.md`.
- **Coding & Testing Standards**: Consult `docs/engineering/CODING_STANDARDS.md` and `TESTING_STRATEGY.md`.
- **Agent Guide**: Consult `docs/AGENT_DEVELOPMENT_GUIDE.md`.

---

## 5. Security Constraints
- Zero cross-tenant data leakage. Always run RLS isolation tests before submitting code.
- Field-level AES-256 envelope encryption for Aadhaar, PAN, Bank Accounts, and Salary details.
- DPDP Act 2023 compliance: Explicit biometric consent logging and statutory retention management.

---

## 6. Testing Expectations
- 100% test coverage on statutory payroll formulas and RLS policies.
- >95% branch coverage on attendance pairing, daily rollup, and leave ledger logic.
- Golden test suites must pass down to exact paisa (±₹0.00).

---

## 7. Git & Development Safety
- Never commit or push directly to `main` without review.
- Never invent product decisions or silently convert recommendations to approved status.
- Tag all commits with conventional commit syntax (`feat`, `fix`, `docs`, `refactor`, `test`).

