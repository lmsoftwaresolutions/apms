# APMS Rebuild

**Automated Payroll & Attendance Management System** — India-first, multi-tenant SaaS for complex shifts, vendor-agnostic punch capture (biometric, mobile geo, RFID, CCTV adapters), deterministic attendance, leave ledgers, and statutory payroll.

## Start here

| Document | Purpose |
| :--- | :--- |
| [`CONTEXT.md`](CONTEXT.md) | **Single source of truth** — vision, processors, modules, pricing, roadmap |
| [`docs/product/SRS.md`](docs/product/SRS.md) | Software requirements (shall / should) |
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
