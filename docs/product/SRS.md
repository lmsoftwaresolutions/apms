# APMS — Software Requirements Specification (SRS)

> **Normative.** Derived from discovery research, product planning checklist, vision, and market audit (Nov 2026).  
> **SSOT for product intent:** `CONTEXT.md`. **SSOT for formulas:** `BUSINESS_RULES.md`.  
> Keywords: **shall** = mandatory · **should** = recommended · **may** = optional.

---

## 1. Purpose & scope

### 1.1 Purpose
APMS shall provide multi-tenant workforce attendance, shift/roster management, leave accounting, India statutory payroll, and analytics, with vendor-agnostic punch capture.

### 1.2 In scope (MVP → GA)
- Multi-tenant org/IAM, policy engine, shifts/rosters  
- Device adapters + immutable raw punch pipeline  
- Attendance processor (pairing, rollup, anomalies, traces)  
- Leave ledger, OT/comp-off, allowances  
- Payroll processor (India statutory pack)  
- Analytics processor (muster, operational KPIs)  
- ESS web; mobile geo in Phase 5  
- CCTV frame-adapter path designed in MVP, implemented Phase 6  

### 1.3 Out of scope (until post-GA)
- Full HRMS H01–H10 (ATS, PMS, LMS, etc.)  
- Non-India statutory engines  
- Using Aadhaar / national ID numbers as punch credentials  

---

## 2. Stakeholders & personas

| Persona | Primary needs |
| :--- | :--- |
| Tenant Admin | Config, billing, security |
| HR / Payroll | Lock periods, explainable days, statutory files |
| Supervisor | Roster, swaps, OT approve, live headcount |
| Employee | Fair punch, leave, payslip, regularization |
| Device Admin | Adapter health, clock drift, mapping |
| Platform Admin | Tenant lifecycle, impersonation audit |

---

## 3. System architecture requirements

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| ARCH-01 | System shall separate **Device Adapters**, **Attendance Processor**, **Payroll Processor**, and **Analytics Processor** | P0 |
| ARCH-02 | Adapters shall emit a canonical punch event; processors shall not embed vendor SDKs | P0 |
| ARCH-03 | Deployment shall support modular monolith with optional dedicated ingest/attendance/payroll/analytics workers | P0 |
| ARCH-04 | All tenant data access shall enforce PostgreSQL RLS on `tenant_id` | P0 |
| ARCH-05 | Raw biometric templates shall not be stored in cloud databases | P0 |
| ARCH-06 | System shall offer at least one **non-biometric** punch modality per site (card/PIN/manual+approval) | P0 |
| ARCH-07 | India data residency shall be default for primary storage and backups | P0 |

---

## 4. Functional requirements

### 4.1 Capture & adapters

| ID | Requirement | Priority | Pack |
| :--- | :--- | :--- | :--- |
| CAP-01 | Shall ingest ZKTeco ADMS and eTimeOffice/HTTP push | P0 | Capture |
| CAP-02 | Shall support Edge Sync Agent with ≥7-day local buffer | P0 | Capture |
| CAP-03 | Shall support CSV/XLSX bulk punch import | P0 | Capture |
| CAP-04 | Shall debounce duplicate punches (default 60s) | P0 | Capture |
| CAP-05 | Shall detect device clock drift > ±5 minutes | P0 | Capture |
| CAP-06 | Should support mobile geofenced punch + mock-location detection | P1 | Workforce |
| CAP-07 | Should support on-device mobile face/fingerprint attestation signals (not cloud templates) | P1 | Workforce |
| CAP-08 | Should support RFID/card adapters | P1 | Workforce |
| CAP-09 | Shall provide CCTV adapter SPI: connect vendor/branch device → extract timed frames → emit punches | P2 | Command |
| CAP-10 | May support vein/iris terminals via generic biometrics adapter | P3 | Command |

### 4.2 Attendance processor

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| ATT-01 | Shall persist immutable `raw_envelope` then `punch_event` | P0 |
| ATT-02 | Shall pair punches to dated shift sessions (not blind 24h first-in/second-out) | P0 |
| ATT-03 | Shall exclude multi-session mid-gaps from worked/OT (N65) | P0 |
| ATT-04 | Shall roll up via `DURATION_RATIO` with configurable bands (N66a) | P0 |
| ATT-05 | Shall enforce session min-presence caps (N66b) | P0 |
| ATT-06 | Shall support session-targeted half-day leave (N66c) | P0 |
| ATT-07 | Shall credit employer-cancelled sessions per N66d | P0 |
| ATT-08 | Shall flag lone punches `NEEDS_REVIEW` (Q4); never auto-grant OT from lone punch | P0 |
| ATT-09 | Shall store immutable explanation trace per daily record | P0 |
| ATT-10 | Shall reprocess deterministically on late/out-of-order punches | P0 |
| ATT-11 | Should support overnight and continuous multi-day duty attribution (Q5) | P1 |

### 4.3 Shifts & roster

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| SHF-01 | Shall support fixed, flexi, overnight, multi-session, continuous templates | P0 |
| SHF-02 | Shall materialize immutable dated shift instances | P0 |
| SHF-03 | Shall support N67 dual-path same-day changes | P0 |
| SHF-04 | Should support dynamic shift-pool matching | P1 |

### 4.4 Leave

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| LVE-01 | Shall use append-only leave transactions; no mutable scalar balance | P0 |
| LVE-02 | Shall support configurable sandwich rules | P0 |
| LVE-03 | Shall support branch holiday calendars | P0 |

### 4.5 Payroll processor

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| PAY-01 | Shall run guided 10-step wizard with pre-run reconciliation | P0 |
| PAY-02 | Shall compute EPF, ESI, PT, LWF, TDS from versioned statutory tables | P0 |
| PAY-03 | Shall match golden test vectors to ±₹0.00 | P0 |
| PAY-04 | Shall lock closed periods; post-lock fixes via arrears only | P0 |
| PAY-05 | Shall generate password-protected payslip PDFs and bank export files | P0 |
| PAY-06 | Should export Tally/Zoho journal artifacts | P1 |

### 4.6 Analytics processor

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| ANA-01 | Shall produce muster roll (Form 25-compatible) | P0 |
| ANA-02 | Shall expose presenteeism / OT cost / exception queues by org unit | P1 |
| ANA-03 | Shall not recompute payroll; consume finalized ledgers only | P0 |

### 4.7 Compliance & security

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| SEC-01 | Shall capture biometric notice + consent ledger (purpose, retention, withdraw) and offer non-biometric alternate punch path | P0 |
| SEC-05 | Shall delete biometric templates from devices/edge on employee exit; retain punch events per labour retention (default 5 years) | P0 |
| PAY-07 | Should default overtime multiplier to 2.0× ordinary wage per OSH Code s.27, with versioned state caps | P0 |
| SEC-02 | Shall encrypt Aadhaar, PAN, bank, salary fields (AES-256 envelope) | P0 |
| SEC-03 | Shall audit PII unmask and admin impersonation | P0 |
| SEC-04 | Should support TOTP MFA for admin/payroll roles | P1 |

---

## 5. Non-functional requirements

| ID | Requirement |
| :--- | :--- |
| NFR-01 | Ingest path should sustain ≥10k punches/min with p95 <200ms accept latency (enqueue) |
| NFR-02 | Recalculation of one employee-day should be idempotent |
| NFR-03 | Zero cross-tenant leakage in automated RLS tests |
| NFR-04 | Infrastructure cost target ≤ ₹80 / active employee / month |
| NFR-05 | Edge Agent shall survive network outages without punch loss (buffer + retry) |

---

## 6. Acceptance criteria (MVP)

1. Two tenants cannot read each other’s punches under RLS fail-closed tests.  
2. Identical punch sets + policies → identical attendance & payroll outputs.  
3. Every finalized attendance day has a persisted explanation trace.  
4. Statutory fixtures pass exact-paisa assertions.  
5. Adapter SPI allows adding a mock vendor without changing attendance processor code.

---

## 7. Traceability

| Area | Detail location |
| :--- | :--- |
| Product strategy & pricing | `CONTEXT.md` §§1,5,9 |
| Business math | `docs/requirements/BUSINESS_RULES.md` |
| Decision status | `docs/requirements/OPEN_QUESTIONS.md` |
| ADRs | `docs/decisions/DECISION_REGISTER.md` |
