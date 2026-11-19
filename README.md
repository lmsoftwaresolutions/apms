# APMS Rebuild

**Automated Payroll & Attendance Management System** — India-first, multi-tenant SaaS for complex shifts, vendor-agnostic punch capture (biometric, mobile geo, RFID, CCTV adapters), deterministic attendance, leave ledgers, and statutory payroll.

## Start here

| Document | Purpose |
| :--- | :--- |
| [`CONTEXT.md`](CONTEXT.md) | **Single source of truth** — vision, competitors, WTP, compliance, roadmap |
| [`docs/market/MARKET_RESEARCH.md`](docs/market/MARKET_RESEARCH.md) | Global software + hardware market research (evidence) |
| [`docs/product/SRS.md`](docs/product/SRS.md) | Software requirements (shall / should) |
| [`docs/database/schema.dbml`](docs/database/schema.dbml) | Database schema (DBML) |
| [`docs/requirements/BUSINESS_RULES.md`](docs/requirements/BUSINESS_RULES.md) | Attendance & payroll formulas |
| [`docs/SANITATION_AUDIT.md`](docs/SANITATION_AUDIT.md) | What was removed and why |
| [`AGENTS.md`](AGENTS.md) | Rules for coding agents |
| [`docs/engineering/DEVELOPMENT_PLAN.md`](docs/engineering/DEVELOPMENT_PLAN.md) | V1 engineering sequence (docs before the next code phase) |

## Architecture (summary)

```text
Device Adapters → Raw Ingestion → Attendance Processor
                                      ├→ Payroll Processor
                                      └→ Analytics Processor
```

CCTV is a **separate connector + frame-extraction adapter**; it does not live inside the attendance engine.

## Status

Discovery docs remain the source of truth. The first runnable slice is tenant IAM plus branch CRUD.

Permissions are keys such as `org.branch.read`. A role is a bundle of those keys. Every tenant table has row-level security. The signed-in request sets `app.current_tenant_id`.

```bash
docker compose up --build
cd frontend && npm install && npm run dev
```

Sign in as `admin@northmill.example` / `ChangeMe-Admin-1` (all keys) or `supervisor@northmill.example` / `ChangeMe-Supervisor-1` (can read and update branches, cannot delete them or edit roles). `admin@southmill.example` uses the same admin password and cannot see North Mill.

`DATABASE_URL_MIGRATE` must be a PostgreSQL superuser. The API connects as `apms_app`, which cannot bypass row-level security.
