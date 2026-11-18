# APMS — Agent Development Instructions

## Product
**APMS** is an India-first multi-tenant B2B SaaS for vendor-agnostic attendance capture, deterministic attendance, double-entry leave, and statutory payroll.

**Master SSOT:** [`CONTEXT.md`](CONTEXT.md)  
**Requirements:** [`docs/product/SRS.md`](docs/product/SRS.md)  
**Formulas:** [`docs/requirements/BUSINESS_RULES.md`](docs/requirements/BUSINESS_RULES.md)  
**Decisions:** [`docs/requirements/OPEN_QUESTIONS.md`](docs/requirements/OPEN_QUESTIONS.md) · [`docs/decisions/DECISION_REGISTER.md`](docs/decisions/DECISION_REGISTER.md)

## Stack
Python 3.12+ FastAPI · PostgreSQL 16+ RLS · SQLAlchemy 2 async · Alembic · Redis · Celery/ARQ · React 18+ TS Vite · Edge Sync Agent · Docker / K8s

## Invariants (never violate)
1. RLS + `app.current_tenant_id` on every tenant query  
2. Append-only `raw_envelope` / `punch_event`  
3. Attendance processor ≠ Payroll processor; payroll never mutates punches  
4. Immutable JSON explanation traces  
5. Double-entry leave ledger  
6. N65 mid-session gap exclusion  
7. Statutory ceilings from DB tables, not code constants  
8. Idempotent background jobs  
9. Device **adapters** isolated from attendance math  
10. No cloud storage of raw biometric templates  

## Progressive disclosure
Load only what the task needs: `CONTEXT.md` first, then `SRS.md`, then `BUSINESS_RULES.md` / module code. Do not recreate deleted narrative docs.

## Status discipline
Never promote OPEN/RECOMMENDED → CONFIRMED without Product Owner approval. Keep requirement IDs stable once published.

## Git
Conventional commits (`feat`, `fix`, `docs`, `refactor`, `test`). No direct unreviewed pushes to `main`.
