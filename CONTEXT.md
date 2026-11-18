# APMS — Master Context (Single Source of Truth)

> **Status:** Authoritative | **Phase:** Discovery & Design | **Market:** India-first  
> **Precedence:** `CONTEXT.md` > `docs/product/SRS.md` > `docs/requirements/BUSINESS_RULES.md` > other docs  
> **Rule:** Do not duplicate truths elsewhere. Link here. Mark OPEN / RECOMMENDED / CONFIRMED.

---

## 1. Product definition

**APMS** (Automated Payroll & Attendance Management System) is a next-generation, multi-tenant B2B SaaS platform for complex workforce scheduling, **vendor-agnostic multi-modal punch capture**, deterministic attendance, double-entry leave, India statutory payroll, and analytics.

**Not** a white-collar-only HRMS clone. **Not** a desktop utility tied to one biometric brand.

### Core value

| Pillar | Promise |
| :--- | :--- |
| Capture | Phone (face/fingerprint + geo), biometric terminal (face/finger/RFID), kiosk, CCTV walk-through, file import — via **adapters**, not hardcoded SDKs in the attendance engine |
| Compute | Deterministic attendance with immutable explanation traces |
| Pay | Separate payroll processor; India EPF/ESI/PT/TDS; exact-paisa accuracy |
| Trust | RLS multi-tenancy, DPDP biometric consent, on-device templates, alternate non-biometric punch path |

### Target industries (priority)

1. **P0** Manufacturing / plants (overnight, OT, contract labour)  
2. **P0** Healthcare (multi-day duty, rotations) — validate private-hospital duty lengths in interviews  
3. **P1** Retail / hospitality (split shifts, multi-branch)  
4. **P1** Security / facility (multi-site, open shifts)  
5. **P2** Education (faculty sessions, academic calendar)  
6. **P2** IT / hybrid (WFH quota, flexi hours)

---

## 2. Processor architecture (non-negotiable separation)

Processors are **independently deployable workers** sharing contracts/events. Adapters never contain attendance math; processors never speak device SDKs.

```text
[Devices / Mobile / CCTV / Files]
        │
        ▼
┌───────────────────┐
│  DEVICE ADAPTERS  │  SPI: normalize → CanonicalPunchEvent
│  (per vendor/mode)│  ZKTeco ADMS | eSSL | eTimeOffice | Mobile Geo |
│                   │  RFID | Kiosk | CCTV Frame | CSV/XLSX
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  RAW INGESTION    │  append-only raw_envelope → punch_event
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  ATTENDANCE PROC  │  pairing, N65 gaps, rollup, anomalies, traces
└─────────┬─────────┘
          ├──────────────────────┐
          ▼                      ▼
┌───────────────────┐   ┌───────────────────┐
│  PAYROLL PROC     │   │  ANALYTICS PROC   │
│  10-step wizard   │   │  muster, OT cost, │
│  statutory, PDF   │   │  presenteeism,    │
└───────────────────┘   │  compliance KPIs  │
                        └───────────────────┘
```

### CCTV module (separate)

| Stage | Responsibility |
| :--- | :--- |
| Connector | Branch/vendor camera stream or NVR (ONVIF/RTSP/vendor SDK) — **adapter only** |
| Frame extract | Detect person passage; extract single frames + timestamps |
| Match | Edge/local face match → employee_id (templates stay on edge; cloud gets event only) |
| Emit | Canonical punch (`source=CCTV`, `in|out|passage`) into raw ingestion |

**CONFIRMED invariant (BR-BIO-01):** Raw biometric templates never stored in cloud. Cloud stores punch events + consent metadata only.

---

## 3. Architectural invariants (CONFIRMED)

1. PostgreSQL **RLS** on every tenant table; `app.current_tenant_id` always set.  
2. **Immutable** `raw_envelope` / `punch_event` (append-only).  
3. **Attendance ≠ Payroll** — payroll consumes finalized attendance; never mutates punches.  
4. **Explanation traces** — immutable JSON for every daily attendance & pay run.  
5. **Double-entry leave** — balances derived from `leave_transactions`.  
6. **N65** — mid-session gaps excluded from worked hours & OT.  
7. **Statutory params** — EPF/ESI/PT ceilings in versioned DB tables, never hardcoded.  
8. **Idempotent jobs** — idempotency keys + safe retries.  
9. **Dated shift instances** — roster expands to immutable daily instances; ad-hoc = N67.  
10. **Infra cost ceiling** — hosting ≤ **₹80 / active employee / month**.

Stack (CONFIRMED): Python 3.12+ FastAPI · PostgreSQL 16+ · Redis · Celery/ARQ · React 18+ TS Vite · Edge Agent (Python/Rust) · Docker Compose → K8s.

Style: **Modular monolith** (ADR-01); scale by splitting workers (ingest / attendance / payroll / analytics), not premature microservices.

---

## 4. Module catalog (canonical IDs M01–M21)

> **Canonical numbering = M01–M21.** Older M1–M9 labels in archived drafts are obsolete.

### Control layers (always)

| Layer | Module | Answers |
| :--- | :--- | :--- |
| Flags | M02 | Is capability enabled for tenant? |
| Policies | M06 | How does it behave? Org→Branch→Dept→Employee |
| Permissions | M03 | Who may act? |

### P0 — Foundation & engines

| ID | Module | Must ship |
| :--- | :--- | :--- |
| M01 | Super Admin & Tenant | Provision, plans, MAU billing, lifecycle, India residency |
| M02 | Feature Flags | Module/sub-feature toggles, canary |
| M03 | RBAC / IAM | Roles, MFA, JWT; SSO deferred Phase 4+ |
| M04 | Employee Master | PII envelope encryption, docs vault |
| M05 | Organization | Legal entity→branch→dept; geofence registry; FY |
| M06 | Policy Engine | Effective-dated rules + audit |
| M07 | Shifts | Fixed, flexi, overnight, multi-session, continuous duty, shift pools |
| M08 | Roster | Patterns → dated instances; N67 overrides; N66d cancel |
| M09 | Raw Punch / Adapters | Multi-source ingest, debounce, clock-drift, OOO reprocess |
| M10 | Attendance Engine | Pairing, rollup N66a–d, Q4 lone punch, traces |

### P1 — Business ops

| ID | Module | Must ship |
| :--- | :--- | :--- |
| M11 | Leave & Holidays | Double-entry, sandwich, session half-day |
| M12 | OT & Comp-Off | N20 approval-gated OT; 1.5x/2.0x; caps |
| M13 | Allowances | Config ≠ calc; night/on-call/session pay |
| M14 | Payroll | 10-step wizard; EPF/ESI/PT/LWF/TDS; bank/Tally; lock+arrears |
| M15 | ESS | Calendar, regularization, leave, payslips |
| M16 | Device Telemetry | Adapter health, Edge Agent, kiosk |
| M17 | Analytics | Muster Form 25, dashboards, statutory schedules |
| M18 | Workflows | Multi-tier approve, SLA escalate, WhatsApp/SMS/email |

### P2 — Field & mobile

| ID | Module | Notes |
| :--- | :--- | :--- |
| M19 | Mobile Geo | Native/PWA; geofence; mock-GPS detect; offline queue |
| M20 | Field Tracking | L1 punch GPS → L4 duty-hours track (flagged); education/PumpOps later |
| M21 | Lifecycle Automation | Probation→confirm; contract renewals |

### P3 — Full HRMS (post-GA only)

H01–H10 (ATS, PMS, LMS, Expense, Assets, Engagement, POSH, Visitor, Alumni, Psychometrics) — see roadmap; **do not block APMS GA**.

---

## 5. Feature matrix — priority × pricing tier

**Billing unit:** Monthly Active Attendance-Tracked Users (**MAU**).  
**India market bands (2026 verified):** SMB ~₹40–100 PEPM; mid-suite bases ~₹2.5k–₹7k/mo for 50 seats; enterprise quote-only.

### Recommended APMS packs (CONFIRMED commercial strategy — PO)

| Pack | Target | Guide price (ex-GST) | Included | Upsells |
| :--- | :--- | :--- | :--- | :--- |
| **Capture** | Attendance-first SMBs / multi-site biometric | ₹49 PEPM · min 25 MAU **or** ₹1,999/mo for ≤40 | M01–M10, M11 basic, M15, M16 (2 adapters), M17 muster, M18 L1 approve | Extra adapter ₹499/mo; WhatsApp ₹15 PEPM |
| **Workforce** | Factories, hospitals, retail chains | ₹79 PEPM · min 50 **or** ₹3,999/mo for ≤50 | Capture + full leave/OT/allowance + **Payroll India** + roster advanced + mobile L1–L2 geo | Face kiosk; GPS L3 ₹25 PEPM |
| **Command** | Multi-entity / security / field force | ₹119 PEPM · min 100 | Workforce + L3/L4 field + CCTV adapter pack + SSO + dedicated cell option | Continuous CCTV streams priced per camera/site |
| **Education** | Institutes | Workforce − ₹15 PEPM student MAU discount | Student/guardian roles; timetable; homework later (M20 edu) | — |

**Competitive wedge:** Competitors gate geofence / split shifts / fraud tools to premium. APMS puts **complex attendance + explainable payroll** in Workforce (not upsold away). Capture plan is honest (no fake “free payroll”).

**Hardware:** Software-only by default. Optional partner devices (ZKTeco/eSSL/face kiosk). Never lock software to one OEM.

---

## 6. Punch sources & adapter roadmap

| Source | Adapter | Priority | Pack |
| :--- | :--- | :--- | :--- |
| ZKTeco ADMS push | `adapter.zkteco_adms` | P0 | Capture |
| eTimeOffice / HTTP push | `adapter.etimeoffice` | P0 | Capture |
| eSSL / generic SDK via Edge | `adapter.edge_poll` | P0 | Capture |
| CSV/XLSX import | `adapter.file_bulk` | P0 | Capture |
| Mobile geo + optional on-device face/fingerprint | `adapter.mobile_geo` | P1 | Workforce |
| Shared tablet kiosk (PIN/QR + edge face) | `adapter.kiosk` | P1 | Workforce |
| RFID / card | `adapter.rfid` | P1 | Workforce |
| CCTV frame extract (vendor-agnostic) | `adapter.cctv_frame` | P2 | Command |
| Vein / iris (Japan/Korea-class terminals) | `adapter.generic_biometrics` | P3 | Command+ |

**Canonical punch event (minimum):**  
`tenant_id, employee_ref, event_at_utc, direction?, source, device_id, site_id, geo?, evidence_ref?, adapter_id, payload_hash`

---

## 7. Global biometric patterns → APMS design rules

| Region | Practice | APMS implication |
| :--- | :--- | :--- |
| **Japan** | Face / finger / **palm vein** / iris; IC-card still common; APPI treats biometrics as personal identifier codes; Work Style Reform needs **objective** time records | Prefer on-device match; always offer IC/RFID/PIN alternate; store events not templates |
| **China** | Face attendance common; 2025 Facial Recognition Measures: separate consent, **non-face alternative**, minimize storage/transmission | Alternate punch path mandatory; purpose-limited retention; no sole-biometric coercion |
| **Korea** | Biometrics = sensitive under PIPA; **separate consent**; prefer process-on-device; provide card/PIN alternative | Consent ledger + alternate modality; edge processing default |
| **Singapore** | PDPC biometric guide; employment-management may be reasonable, **explicit consent still best practice** | Consent UX + retention limits; transparency in ESS |
| **India** | DPDP Act 2023 sensitive personal data; Aadhaar not an attendance credential | Explicit biometric consent; India data residency; never use Aadhaar/MyNumber-class IDs as punch keys |

**Futuristic defaults:** multimodal (face **or** finger **or** card **or** geo+selfie); liveness / anti-spoof on mobile; CCTV as soft attendance + exception evidence, not sole payroll authority without policy flag.

---

## 8. Confirmed domain decisions (index)

| ID | Decision | Status |
| :--- | :--- | :--- |
| Q1 | Shared DB + RLS | CONFIRMED |
| Q2 | Append-only raw envelope | CONFIRMED |
| Q3 | 4-tier policy hierarchy | CONFIRMED |
| Q4 | Lone punch → `NEEDS_REVIEW` | CONFIRMED |
| Q5 | Continuous multi-day duty attribution | RECOMMENDED (`start_date` / duty_units) |
| Q6 | WFH auto-approve within quota | CONFIRMED |
| Q7 | 10-step pay wizard | CONFIRMED |
| Q8 | Native protocols: ADMS, eTimeOffice, Edge, file | CONFIRMED |
| Q9 | Double-entry leave | CONFIRMED |
| N65 | Mid-gap non-working | CONFIRMED |
| N66a–d | Duration ratio, min presence, session leave, cancel-paid | CONFIRMED |
| N67 | Dual-path same-day shift change | CONFIRMED |
| N20 | OT approval-gated | CONFIRMED |
| N18 | Pay cut-off vs calendar | RECOMMENDED |

Formulas: `docs/requirements/BUSINESS_RULES.md`. ADR index: `docs/decisions/DECISION_REGISTER.md`.

**OPEN (needs PO / legal):** Labour Codes OT post-Nov-2025 state rules; negative leave balance default; holiday pay for per-session workers; private-hospital continuous-duty interviews.

---

## 9. Release strategy

| Phase | Scope | Outcome |
| :--- | :--- | :--- |
| **0–1** | M01–M06, M09 adapters (ADMS/Edge/file), basic M07/M08 | Live punches, zero tenant leak |
| **2** | M10, M11, M18 | Explainable attendance + leave |
| **3** | M12–M14, M17 statutory | Exact-paisa India payroll |
| **4 GA** | Hardening, arrears, escalation, DPDP audits | Production GA |
| **5** | M19–M20 L1–L3 | Mobile field |
| **6** | CCTV adapter, SSO/SCIM, AI roster assist, H01+ | Command / HRMS expand |

**MVP DoD:** RLS isolation tests pass · no punch drops · deterministic recalculation · paisa-exact golden vectors · every day has explanation trace.

---

## 10. Documentation map (post-sanitation)

| File | Role |
| :--- | :--- |
| **`CONTEXT.md`** | Master SSOT (this file) |
| `docs/product/SRS.md` | Normative requirements (shall / should) |
| `docs/requirements/BUSINESS_RULES.md` | Math & policy formulas |
| `docs/requirements/OPEN_QUESTIONS.md` | Q/N status board |
| `docs/decisions/DECISION_REGISTER.md` | ADR index |
| `docs/SANITATION_AUDIT.md` | Drift log + removed redundancy |
| `AGENTS.md` | Agent coding invariants |
| `README.md` | Human onboarding |

Archived / removed pre-sanitation drafts: see `docs/SANITATION_AUDIT.md`. Do not resurrect duplicates.
