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

## Architecture (summary)

```text
Device Adapters → Raw Ingestion → Attendance Processor
                                      ├→ Payroll Processor
                                      └→ Analytics Processor
```

CCTV is a **separate connector + frame-extraction adapter**; it does not live inside the attendance engine.

## Status

Discovery & design. Implementation must follow `CONTEXT.md` + `SRS.md`. Application code is not the focus of the current documentation branch.
