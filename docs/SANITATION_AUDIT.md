# Documentation Sanitation Audit

**Date:** 2026-11-18  
**Branch:** `docs/context-ssot-sanitation`  
**Goal:** One SSOT (`CONTEXT.md`), eliminate redundancy, fix semantic drift.

---

## 1. Semantic / contextual drift found

| Drift | Evidence | Resolution |
| :--- | :--- | :--- |
| Module IDs conflict | `SYSTEM_ARCHITECTURE` used M1–M9; `MODULES_AND_FEATURES` / planning checklist used M01–M21; API maps referenced M07/M09/M15 inconsistently | **Canonical = M01–M21** in `CONTEXT.md` |
| CCTV timing | `MVP_SCOPE` deferred CCTV to Phase 6; `MODULES_AND_FEATURES` listed CCTV under M09 as if current | SPI designed now; implement Phase 6 / Command pack (`CONTEXT` §6,9) |
| Processor boundaries | Docs mixed “modular monolith modules” with device SDK logic inside attendance | Explicit **Adapter / Attendance / Payroll / Analytics** separation in `CONTEXT` §2 + `SRS` ARCH-01 |
| Product SSOT claims | `BUSINESS_RULES`, `VISION`, `PRD`, `MODULES_AND_FEATURES`, `ARCHITECTURE_INDEX` each claimed authority | Precedence chain locked in `CONTEXT` header |
| Absolute Windows paths | Many docs linked `file:///d:/APMS_Rebuild/...` | Removed with those files |
| Research duplication | `.docx` + `.md` competitor report; PDF/DOCX vision overlapping product markdown | Research folder removed; distilled into `CONTEXT` |
| Missing `SRS.md` | Referenced by PO mission but absent in repo | Authored `docs/product/SRS.md` from research + confirmed rules |
| OT legal basis | Discovery report flagged Factories Act vs Labour Codes (in force Nov 2025) conflict | Left **OPEN** in `CONTEXT` §8 — do not hardcode until legal confirm |
| Hospital 24–48h duties | Specs treated as requirement; discovery tagged unverified for private hospitals | Marked interview validation needed |

---

## 2. Removed (redundant / superseded)

### Research binaries & notes (`reserch_files/`)
- `APMS Phase 1 — Product Discovery & Market Research Report.docx`
- `APMS – Complete Product Planning Checklist (2).docx`
- `APMS_Product_Vision_and_Scope.pdf`
- `HRMS_Competitor_Analysis_APMS.docx` / `.md`
- `features.docx`

### Product / catalog duplicates
- `docs/product/VISION.md`, `PRD.md`, `MVP_SCOPE.md`, `INDUSTRY_REQUIREMENTS.md`, `HRMS_EXTENSION_ROADMAP.md`
- `docs/MODULES_AND_FEATURES.md`
- `docs/MASTER_PROJECT_TRACKER.md`
- `docs/requirements/REQUIREMENTS_CATALOG.md` (IDs superseded by `SRS.md` CAP/ATT/PAY…)

### Architecture / API / workflow / infra / security / data-flow / module SPECs / engineering prose
All pre-implementation narrative docs that restated the same invariants, C4 diagrams, endpoint maps, and workflows without unique normative formulas — removed to stop drift. Rebuild implementation specs from `CONTEXT` + `SRS` + `BUSINESS_RULES` when coding starts.

### Indexes
- `docs/ARCHITECTURE_INDEX.md`, `docs/ARCHITECTURE_IMAGE_CATALOG.md`, `docs/AGENT_DEVELOPMENT_GUIDE.md`

---

## 3. Retained (unique value)

| Path | Why kept |
| :--- | :--- |
| `CONTEXT.md` | Master SSOT (includes competitor / WTP / compliance sections) |
| `docs/market/MARKET_RESEARCH.md` | Global software+hardware research evidence |
| `docs/product/SRS.md` | Normative shall/should requirements |
| `docs/requirements/BUSINESS_RULES.md` | Authoritative formulas |
| `docs/requirements/OPEN_QUESTIONS.md` | Q/N status board |
| `docs/decisions/DECISION_REGISTER.md` | ADR index |
| `docs/decisions/adr/ADR_TEMPLATE.md` | Future ADRs |
| `AGENTS.md` / `README.md` / `.agents/` | Agent & human entry |

---

## 4. Cross-document sync rules (going forward)

1. Change a business formula → update `BUSINESS_RULES.md` only; link from SRS if new ID.  
2. Change product scope/pricing/priority → update `CONTEXT.md` only.  
3. Change requirement shall/should → update `SRS.md`; bump status in `OPEN_QUESTIONS` if decision.  
4. Never copy invariant lists into new files — link `CONTEXT` §3.  
5. New ADR → file under `docs/decisions/adr/` + row in `DECISION_REGISTER.md`.
