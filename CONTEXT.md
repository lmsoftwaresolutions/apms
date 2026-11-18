# APMS — Master Context (Single Source of Truth)

> **Status:** Authoritative | **Phase:** Discovery & Design | **Market:** India-first  
> **Precedence:** `CONTEXT.md` > `docs/product/SRS.md` > `docs/requirements/BUSINESS_RULES.md` > other docs  
> **Market evidence:** `docs/market/MARKET_RESEARCH.md` (secondary web research, 2026-11-18)  
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
| Trust | RLS multi-tenancy, DPDP notice/consent ledger, on-device templates, **mandatory** non-biometric alternate path |

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

**CONFIRMED invariant (BR-BIO-01):** Raw biometric templates never stored in cloud. Cloud stores punch events + consent/notice metadata only.

---

## 3. Architectural invariants (CONFIRMED)

1. PostgreSQL **RLS** on every tenant table; `app.current_tenant_id` always set.  
2. **Immutable** `raw_envelope` / `punch_event` (append-only).  
3. **Attendance ≠ Payroll** — payroll consumes finalized attendance; never mutates punches.  
4. **Explanation traces** — immutable JSON for every daily attendance & pay run.  
5. **Double-entry leave** — balances derived from `leave_transactions`.  
6. **N65** — mid-session gaps excluded from worked hours & OT.  
7. **Statutory params** — EPF/ESI/PT ceilings + OT rates in versioned DB tables, never hardcoded.  
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
| M12 | OT & Comp-Off | N20 approval-gated OT; **default 2.0× under OSH Code**; state caps versioned |
| M13 | Allowances | Config ≠ calc; night/on-call/session pay |
| M14 | Payroll | 10-step wizard; EPF/ESI/PT/LWF/TDS; bank/Tally; lock+arrears |
| M15 | ESS | Calendar, regularization, leave, payslips |
| M16 | Device Telemetry | Adapter health, Edge Agent, kiosk |
| M17 | Analytics | Muster / OT registers (5-year retain), dashboards |
| M18 | Workflows | Multi-tier approve, SLA escalate, WhatsApp/SMS/email |

### P2 — Field & mobile

| ID | Module | Notes |
| :--- | :--- | :--- |
| M19 | Mobile Geo | Native/PWA; geofence; mock-GPS detect; offline queue |
| M20 | Field Tracking | L1 punch GPS → L4 duty-hours track (flagged); education/PumpOps later |
| M21 | Lifecycle Automation | Probation→confirm; contract renewals |

### P3 — Full HRMS (post-GA only)

H01–H10 (ATS, PMS, LMS, Expense, Assets, Engagement, POSH, Visitor, Alumni, Psychometrics) — do not block APMS GA.

---

## 5. Competitor matrices (research-backed)

Detail + sources: `docs/market/MARKET_RESEARCH.md`.

### 5.1 India software matrix (must-beat / must-integrate)

| Competitor | Strength | Weakness vs APMS | Price signal |
| :--- | :--- | :--- | :--- |
| greytHR | Brand + payroll depth | Attendance gated to Growth; GPS live upsold | ₹2.5k–4.5k/50 |
| HROne | Att+pay in Basic; WhatsApp | Less industrial overnight depth | ₹4.95k/50 |
| Keka | Mid-market UX | 100-seat floors; overnight gaps admitted historically | Quote / 100-slab |
| factoHR | Free≤20; AI face | Geo gated Premium | ₹5k/50 Core |
| Ankastra / VelHR / OTOMATE / Navlakha | Cheap att→pay; multi-OEM | Thin explainability / enterprise RLS story | **₹15–45 PEPM** floor |
| pagar karo / ZFour / Timelabs | Transparent PEPM; field | Less multi-session math branding | ₹31–90 PEPM |
| Truein / Jibble | Face kiosk / global att | No full India statutory | Att-only |
| Darwinbox / Workday+local pay | Enterprise | Overkill + dual vendor for India pay | Quote |

**APMS wedge:** Multi-OEM adapters + N65/N66 explainable attendance + India payroll **in Workforce** (not upsold away) + Edge offline + RLS tenancy.

### 5.2 Global software matrix (learn / later localize)

| Region | Exemplars | Modalities to copy | Price band |
| :--- | :--- | :--- | :--- |
| Japan | KING OF TIME, Jobcan, Touch On Time, oziTime, Xronos | IC + finger-vein + iPad face + liveness + GPS | ¥200–300/user |
| Korea | Suprema stack + AC suites | Face/fingerprint + mobile; on-device; AI VMS | Hardware+SaaS |
| China | DingTalk, Feishu, Hikvision T&A | Face/GPS/Wi-Fi; FR Measures compliance | Suite-bundled |
| SG/MY | StaffAny, Swingvy, brioHR, QuickHR | Face/QR/Wi-Fi/geo + roster | RM3–10+ / S$5+ |
| GCC | Bayzat | Face+liveness + WPS payroll | Quote |
| US/EU | UKG, ADP, Paycom, BambooHR, Factorial, Personio | Clocks + geo + kiosk; quote-heavy | $8–25+ PEPM / quote |

### 5.3 Hardware OEM matrix (adapter priority)

| Priority | OEM | Protocol | India street ₹ (ex-GST) | Adapter |
| :--- | :--- | :--- | :--- | :--- |
| P0 | eSSL | ADMS / eTime / SDK | ~8–21k | `edge_poll` / push |
| P0 | ZKTeco | ADMS / TCP / ZKBio | ~7.5–28k | `zkteco_adms` |
| P0 | File/CSV | Any OEM export | — | `file_bulk` |
| P1 | Matrix COSEC | HTTP push / CENTRA | ~18–70k | `matrix_cosec` |
| P1 | Hikvision MinMoe | ISAPI | ~10–16k | `hikvision_isapi` |
| P1 | Realtime / BioMax | Push / export | ~4–21k | `edge_poll` / file |
| P2 | Suprema | BioStar 2 REST | ~30–80k | `suprema_biostar` |
| P2 | CCTV overlay | RTSP/ONVIF edge | Cameras already owned | `cctv_frame` |
| P3 | Vein/iris (Hitachi/NEC class) | Vendor SDK | Premium | `generic_biometrics` |

**Hardware policy (CONFIRMED):** Software-agnostic; never lock to one OEM; partner AMC optional; tablet kiosk is first-class.

---

## 6. India vertical WTP & pricing strategy

### 6.1 Observed market floors (2026)

| Band | PEPM / base | Who lives here |
| :--- | :--- | :--- |
| Ultra-low att+pay | ₹15–45 PEPM | OTOMATE, Navlakha, pagar Attendance/Payroll |
| SMB suite base | ₹2.5k–6k / 50 seats | greytHR, VelHR, Ankastra, factoHR |
| Mid HCM | ₹5k–10k / 50 + ₹85–130 extra | HROne, Pocket Pro, Timelabs |
| Field / Pro | ₹79–150 PEPM | pagar Pro, AttendancePay Pro, suite add-ons |

**No primary WTP survey exists** (OPEN). Vertical WTP below is **inferred** from vendors that win that segment + feature density.

### 6.2 Vertical willingness-to-pay (RECOMMENDED planning bands)

| Vertical | Priority | Inferred WTP | Buy trigger | APMS pack |
| :--- | :--- | :--- | :--- | :--- |
| Manufacturing MSME | P0 | **₹35–70 PEPM** | Night/OT/contract muster without Excel | Workforce (discount to ₹59 if ≤100 MAU Y1) |
| Multi-plant factory | P0 | **₹70–110 PEPM** | Multi-OEM + Edge offline + arrears | Workforce → Command |
| Healthcare | P0 | **₹60–100 PEPM** | Duty attribution + hygiene face | Workforce + duty engine |
| Retail / hospitality | P1 | **₹40–75 PEPM** | Split shifts + multi-branch geo | Capture → Workforce |
| Security / FM | P1 | **₹70–120 PEPM** | Multi-site open shifts + L2/L3 field | Command |
| Education | P2 | **₹25–50 student; ₹50–80 staff** | Session faculty + guardian | Education discount |
| IT / hybrid | P2 | **₹40–70 PEPM** | WFH quota + payroll | Capture + payroll add-on |

### 6.3 APMS packs (RECOMMENDED — revise after interviews)

| Pack | Guide price (ex-GST) | Position vs market | Includes |
| :--- | :--- | :--- | :--- |
| **Capture** | **₹39 PEPM** · min 25 · or ₹1,799/mo ≤40 | Above OTOMATE floor; below greytHR Growth | M01–M11 basic, M15–M18 L1, 2 OEM adapters, muster |
| **Workforce** | **₹69 PEPM** · min 50 · or ₹3,499/mo ≤50 | In MSME WTP; undercuts HROne Basic PEPM math for complex shifts | Capture + full leave/OT/allowance + **India payroll** + advanced roster + mobile L1–L2 |
| **Command** | **₹109 PEPM** · min 100 | Field/security Pro band | Workforce + L3/L4 + CCTV adapter pack + SSO + dedicated cell option |
| **Education** | Workforce − ₹20 student MAU | Volume play | Student/guardian roles |

**Upsells:** Extra adapter ₹399/mo · WhatsApp ₹12 PEPM · GPS L3 ₹20 PEPM · CCTV per camera/site.  
**Infra ceiling remains ₹80 / active employee / month** — Command margin must absorb dedicated cells carefully.

**CONFIRMED commercial rules:** Honest Capture (no fake free payroll); Workforce includes complex attendance+statutory pay; hardware optional.

---

## 7. Punch sources & adapter roadmap

| Source | Adapter | Priority | Pack |
| :--- | :--- | :--- | :--- |
| ZKTeco ADMS push | `adapter.zkteco_adms` | P0 | Capture |
| eTimeOffice / HTTP push | `adapter.etimeoffice` | P0 | Capture |
| eSSL / generic via Edge | `adapter.edge_poll` | P0 | Capture |
| CSV/XLSX import | `adapter.file_bulk` | P0 | Capture |
| Matrix COSEC | `adapter.matrix_cosec` | P1 | Workforce |
| Hikvision ISAPI | `adapter.hikvision_isapi` | P1 | Workforce |
| Mobile geo + on-device face/finger attest | `adapter.mobile_geo` | P1 | Workforce |
| Shared tablet kiosk | `adapter.kiosk` | P1 | Workforce |
| RFID / card | `adapter.rfid` | P1 | Workforce |
| Suprema BioStar 2 | `adapter.suprema_biostar` | P2 | Command |
| CCTV frame extract | `adapter.cctv_frame` | P2 | Command |
| Vein / iris | `adapter.generic_biometrics` | P3 | Command+ |

**Canonical punch event (minimum):**  
`tenant_id, employee_ref, event_at_utc, direction?, source, device_id, site_id, geo?, evidence_ref?, adapter_id, payload_hash`

---

## 8. Legal & biometric compliance (product rules)

> **Counsel required** before locking privacy copy. Status tags below are product engineering defaults.

### 8.1 India — data protection

| Topic | Research reading | APMS rule | Status |
| :--- | :--- | :--- | :--- |
| DPDP Act 2023 | Biometrics = personal data; **no SPDI-style sensitive tier** in DPDP; employment may rely on s.7(i); notice + security still mandatory | Issue clear notice (purpose, retention, rights); purpose-limit to attendance/access | RECOMMENDED |
| SPDI Rules 2011 (until DPDP commencement ~May 2027) | Written consent for biometrics still referenced by advisors | Maintain **explicit biometric consent ledger** + easy withdraw | CONFIRMED (transition) |
| Proportionality / alternate path | Best practice; China/Korea require non-bio alternative | **Mandatory** RFID/PIN/card/app path per site; no sole-biometric coercion | CONFIRMED |
| Template storage | Stronger “reasonable security” expected for biometrics | On-device / edge templates only; encrypt; delete on exit; never Aadhaar as punch key | CONFIRMED |
| CCTV attendance | Footage + face match = personal data; retention limits | Edge match; cloud gets events; short evidence retention; policy flag before payroll-authoritative CCTV | CONFIRMED |
| India residency | Market expectation / procurement | Default India primary + backups | CONFIRMED |

### 8.2 India — labour / payroll compliance

| Topic | Research reading | APMS rule | Status |
| :--- | :--- | :--- | :--- |
| OSH Code 2020 | In force **21 Nov 2025**; OT wages ≥ **twice** ordinary (s.27); worker consent for OT | Default OT multiplier **2.0×**; N20 approval = consent evidence; versioned state caps | RECOMMENDED |
| Registers | Electronic muster / wage / OT registers; labour handbook cites **5 years**; catalog `NFR-02` cites **8 fiscal years** for attendance/payroll ledgers | Retain ledgers **8 fiscal years** (longer of the two); biometric templates deleted on exit | RECOMMENDED |
| EPF/ESI/PT/TDS | Unchanged need for challan/ECR artifacts | Parameterized statutory tables; exact-paisa tests | CONFIRMED |
| Old Factories Act OT lore | Do not hardcode pre-Code quarterly caps blindly | State rule packs; OPEN until counsel | OPEN |

### 8.3 Global biometric patterns → design defaults

| Region | Practice | APMS implication |
| :--- | :--- | :--- |
| **Japan** | Vein/IC/face; APPI identifier codes; objective time records | Events-only cloud; IC alternate; vein adapter P3 |
| **China** | Face common; 2025 FR Measures: consent + non-face alternative | Same SPI; no sole-face |
| **Korea** | PIPA sensitive biometric; separate consent; on-device | Consent ledger + edge |
| **Singapore** | PDPC; employment exception possible; consent recommended | Consent UX + retention |
| **India** | DPDP notice + transition consent; OSH OT 2× | §§8.1–8.2 |

**Futuristic defaults:** multimodal (face **or** finger **or** card **or** geo+selfie); mobile liveness; CCTV as soft attendance unless tenant policy marks authoritative.

---

## 9. Confirmed domain decisions (index)

| ID | Decision | Status |
| :--- | :--- | :--- |
| Q1 | Shared DB + RLS | CONFIRMED |
| Q2 | Append-only raw envelope | CONFIRMED |
| Q3 | 4-tier policy hierarchy | CONFIRMED |
| Q4 | Lone punch → `NEEDS_REVIEW` | CONFIRMED |
| Q5 | Continuous multi-day duty attribution | RECOMMENDED |
| Q6 | WFH auto-approve within quota | CONFIRMED |
| Q7 | 10-step pay wizard | CONFIRMED |
| Q8 | Native protocols: ADMS, eTimeOffice, Edge, file (+ Matrix/Hik P1) | CONFIRMED |
| Q9 | Double-entry leave | CONFIRMED |
| N65 / N66a–d / N67 / N20 | Gap, rollup, leave map, cancel-paid, dual-path, OT gate | CONFIRMED |
| N18 | Pay cut-off vs calendar | RECOMMENDED |

Formulas: `docs/requirements/BUSINESS_RULES.md`. ADR index: `docs/decisions/DECISION_REGISTER.md`.

**OPEN (PO / legal / interviews):** Primary vertical WTP survey; DPDP s.7(i) counsel memo; state OT caps under Codes; private-hospital duty lengths; negative leave balance; holiday pay for per-session workers.

---

## 10. V1 scope (PO, factory-first muster)

**Promise:** the paid day, with the reason, from whatever capture method the site already uses.

### In V1
- eSSL, ZKTeco, and CSV, **plus** CCTV frame punches, face-on-phone, RFID, kiosk, and other device brands through the adapter SPI
- Geofence, live GPS, and field tracking
- Dated shifts: fixed, overnight, split session (unpaid gap), and hospital 24/36-hour duties
- Coaching timetables and student attendance
- Paid-day result with a stored explanation; single punch stays in review
- Missed-punch correction that recalculates the day and keeps the raw punch
- Leave ledger, sandwich rule, and comp-off bank; weekly off and holiday are calendar flags on the day
- Site muster export (status, hours, overtime hours, reason). No salary math

### Cut from V1
- Payroll, PF/ESI/PT/TDS, payslips, and bank files
- Multi-entity, SSO, WhatsApp, and analytics beyond the muster
- AI rostering and buddy-punch models beyond the single-punch review queue

## 11. Release strategy

| Phase | Scope | Outcome |
| :--- | :--- | :--- |
| **V1** | §10 in-scope capture, shifts, leave, field, education, hospital duty, muster | Explainable paid day on the customer’s own devices |
| **V2** | M14 payroll, statutory files, payslips, bank export | Exact-paisa India payroll |
| **Later** | SSO/SCIM, WhatsApp, analytics beyond muster, H01+ | Command / HRMS expand |

**MVP DoD:** RLS isolation · no punch drops · deterministic recalc · paisa-exact vectors · explanation trace every day · alternate punch path enabled · biometric consent/notice logged.

---

## 12. Stable requirement IDs (from PR #1 catalog — do not renumber)

Normative prose lives in `docs/product/SRS.md`. These discovery IDs stay stable for traces and schema notes. Full narrative catalog was **not** restored (it duplicated SRS).

| Prefix | IDs kept | Meaning |
| :--- | :--- | :--- |
| PLT | 01–07 | RLS tenancy, provisioning, hierarchy, audit, flags, policies |
| IAM | 01–04 | RBAC, JWT, MFA; SSO deferred |
| ORG / EMP | ORG-01–02, EMP-01–04 | Org tree, holidays, master, encrypted bank, pay group, **device user-id map** |
| SHF / ROS | SHF-01–06, ROS-01–06, ROS-10 | Shift types, roster, N67, swaps; ROS-06 open shifts deferred |
| DEV / PCH | DEV-01–04, PCH-01–06 | Device catalog, heartbeat, kiosk, drift, immutable ingest, edge, CSV, OOO |
| ATT | 01–15 | Pairing through read/write decoupling |
| LVE / HOL | leave ledger, sandwich, holidays | See BUSINESS_RULES |
| PAY / STA | 10-step wizard, statutory tables | See BUSINESS_RULES |
| PRV / NFR | PRV-01–03, NFR-01–03 | DPDP, erasure, **minor/guardian consent**, 10k punches/min, 8-year ledger retention, ₹80 infra cap |

Schema (unique, not duplicated in prose): `docs/database/schema.dbml`. Punch sources include `CCTV_FRAME` and `RFID_CARD`.

---

## 13. Documentation map

| File | Role |
| :--- | :--- |
| **`CONTEXT.md`** | Master SSOT (this file) |
| `docs/market/MARKET_RESEARCH.md` | Competitor / hardware / WTP / legal evidence |
| `docs/database/schema.dbml` | Relational schema (unique; from PR #1, punch sources extended) |
| `docs/product/SRS.md` | Normative shall / should |
| `docs/requirements/BUSINESS_RULES.md` | Math & policy formulas |
| `docs/requirements/OPEN_QUESTIONS.md` | Q/N status board |
| `docs/decisions/DECISION_REGISTER.md` | ADR index |
| `docs/SANITATION_AUDIT.md` | Drift log |
| `AGENTS.md` / `README.md` | Agent & human entry |
