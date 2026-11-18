# APMS Complete Requirements Catalog

## 1. Overview & Classification Legend

This catalog is the definitive repository of functional and non-functional requirements for APMS. Every requirement maintains a stable alphanumeric ID and status tag.

- **CONFIRMED**: Officially approved and locked for implementation.
- **RECOMMENDED**: Architecturally analyzed and proposed; pending final sign-off.
- **OPEN**: Currently under review; requires tenant or product owner decision.
- **DEFERRED**: Planned for post-MVP phases (Phases 4–6).

---

## 2. Platform, Multi-Tenancy & Governance (`PLT`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PLT-01` | Multi-Tenant Architecture | Shared database architecture with PostgreSQL Row-Level Security (RLS) enforcing tenant isolation. | M01 | P0 | CONFIRMED |
| `PLT-02` | Tenant Provisioning | Automated tenant registration, subdomain allocation, initial super-admin account creation. | M01 | P0 | CONFIRMED |
| `PLT-03` | Configuration Hierarchy | Tiered configuration inheritance: System Defaults → Tenant → Branch → Department → Employee. | M06 | P0 | CONFIRMED |
| `PLT-04` | Audit Trail Logging | Append-only immutable audit log recording user, timestamp, IP, action, entity, before/after values. | M01 | P0 | CONFIRMED |
| `PLT-05` | Tenant Data Isolation Test | Automated test suite validating zero data leakage across tenant boundaries under RLS. | M01 | P0 | CONFIRMED |
| `PLT-06` | Feature Flag Management | Per-tenant capability enablement/disablement (Layer 1 of the 3-Way Separation Model). | M02 | P0 | CONFIRMED |
| `PLT-07` | Policy & Rules Engine | Hierarchical policy resolution: Org Policy → Dept Policy → Employee Exception → Effective Rule. | M06 | P0 | CONFIRMED |

---

## 3. Identity & Access Management (`IAM`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `IAM-01` | Role-Based Access Control | Granular permission sets for Super Admin, HR Manager, Supervisor, Employee, and Auditor (Layer 3). | M03 | P0 | CONFIRMED |
| `IAM-02` | Session & Token Auth | Secure JWT/Bearer session management with refresh token rotation and revocation. | M03 | P0 | CONFIRMED |
| `IAM-03` | MFA Support | Time-based one-time password (TOTP) multi-factor authentication for privileged administrative roles. | M03 | P1 | CONFIRMED |
| `IAM-04` | Enterprise SSO | SAML 2.0 and OpenID Connect (OIDC) integration for enterprise customer directories. | M03 | P2 | DEFERRED |

---

## 4. Organization & Employee Master (`ORG`, `EMP`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ORG-01` | Multi-Branch Hierarchy | Support for legal entities, physical branches, departments, sub-departments, and cost centers. | M05 | P0 | CONFIRMED |
| `ORG-02` | Holiday Calendars | Branch-specific holiday calendars with mandatory and optional/restricted holiday lists. | M11 | P0 | CONFIRMED |
| `EMP-01` | Employee Master Record | Core employee demographics, joining date, confirmation status, designation, department, branch. | M04 | P0 | CONFIRMED |
| `EMP-02` | Encrypted Bank Details | Field-level AES-256 encrypted storage of bank account number, IFSC code, PAN, and Aadhaar. | M04 | P0 | CONFIRMED |
| `EMP-03` | Pay Group Assignment | Assignment of employees to specific Pay Groups dictating pay period cycles and cut-off dates. | M04 | P0 | CONFIRMED |
| `EMP-04` | Device Biometric ID Map | Mapping employee IDs to biometric device user IDs across one or multiple hardware machines. | M16 | P0 | CONFIRMED |

---

## 5. Shift Scheduling & Rostering (`SHF`, `ROS`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SHF-01` | Fixed Standard Shift | Configurable start time, end time, grace in/out, half-day threshold, full-day threshold. | M07 | P0 | CONFIRMED |
| `SHF-02` | Overnight Shift | Shifts crossing midnight with unambiguous boundary date attribution to shift start day. | M07 | P0 | CONFIRMED |
| `SHF-03` | Multi-Session Shift | Split shifts with 2+ scheduled sessions (e.g., 08:00-12:00 and 16:00-20:00). Mid-gap excluded. | M07 | P0 | CONFIRMED |
| `SHF-04` | Flexible Window Shift | Core presence hours combined with flexible total worked duration requirements. | M07 | P1 | CONFIRMED |
| `SHF-05` | Continuous Multi-Day Shift | Duty windows spanning 24h, 36h, or 48h continuous medical/plant duty anchored to start date. | M07 | P0 | CONFIRMED |
| `SHF-06` | Dynamic Shift Matching & Pooling | Assign multiple candidate shifts; engine dynamically resolves shift from punch timestamps. | M07 | P0 | CONFIRMED |
| `ROS-01` | Recurring Rotation Patterns | Pattern-based roster generation (e.g., 6 days work / 1 day off; weekly shift rotation). | M08 | P0 | CONFIRMED |
| `ROS-02` | Continuous 24/7 Rostering | Automated cyclical 3-shift assignment ensuring statutory rest periods between turns. | M08 | P1 | CONFIRMED |
| `ROS-03` | Dated Shift Instances | Materialization of roster patterns into immutable `dated_shift_instance` rows. | M08 | P0 | CONFIRMED |
| `ROS-04` | Ad-Hoc Same-Day Override | Confirmed N67: Supervisor can override shift instance; employee can request shift change. | M08 | P0 | CONFIRMED |
| `ROS-05` | Shift Swap Workflow | Employee-to-employee shift exchange with mutual consent and supervisor approval. | M08 | P1 | CONFIRMED |
| `ROS-06` | Relief / Unassigned Shifts | Open shift slots for security/facility deployments claimable by replacement staff. | M08 | P2 | DEFERRED |
| `ROS-10` | Employer-Cancelled Sessions | Confirmed N66d: Management cancellation of scheduled sessions marked CANCELLED_PAID. | M08 | P0 | CONFIRMED |

---

## 6. Device, Ingestion & Telemetry (`DEV`, `PCH`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DEV-01` | Device Master Catalog | Registration of biometric terminals with serial number, IP, location, brand, protocol. | M16 | P0 | CONFIRMED |
| `DEV-02` | Device Health Heartbeat | Periodic ping (60s) monitoring connectivity status, firmware, and un-synced log lag count. | M16 | P1 | CONFIRMED |
| `DEV-03` | Shared Tablet / Kiosk Mode | Android tablet app with PIN + on-device face verification for sites without biometrics. | M16 | P1 | CONFIRMED |
| `DEV-04` | Clock Drift & Telemetry | Automated tracking of hardware clock drift (>5m) with administrative maintenance alerts. | M16 | P1 | CONFIRMED |
| `PCH-01` | Immutable Raw Ingestion | Device pushes stored un-altered in append-only `raw_envelope` table with hash chaining. | M09 | P0 | CONFIRMED |
| `PCH-02` | Normalized Punch Events | Raw punches normalized into `punch_event` with tenant_id, employee_id, punch_time, source. | M09 | P0 | CONFIRMED |
| `PCH-03` | Idempotent Deduplication | Drop duplicate punches within configurable debounce window (default 60 seconds). | M09 | P0 | CONFIRMED |
| `PCH-04` | Edge Sync Agent | Local on-premises daemon for polling local USB/LAN devices and relaying to cloud API. | M16 | P0 | CONFIRMED |
| `PCH-05` | CSV/Excel Punch Import | Bulk upload of historical punch logs with validation, preview, and asynchronous processing. | M09 | P0 | CONFIRMED |
| `PCH-06` | Out-of-Order Punch Handling | Engine accommodates late-arriving punches and automatically triggers daily recalculation. | M09 | P0 | CONFIRMED |

---

## 7. Attendance Engine & Calculations (`ATT`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ATT-01` | Session-Aware Pairing | Chronological pairing within shift session windows rather than blind 24-hour pairing. | M10 | P0 | CONFIRMED |
| `ATT-02` | Mid-Shift Gap Exclusion | Confirmed N65: Gap intervals between scheduled sessions are strictly non-working time. | M10 | P0 | CONFIRMED |
| `ATT-03` | Overnight Boundary Attribution | Overnight punches attributed deterministically to the shift start calendar date. | M10 | P0 | CONFIRMED |
| `ATT-04` | Grace & Late-Coming Rules | Configurable grace periods for arrival; late-coming tolerance counters and penalty bands. | M10 | P0 | CONFIRMED |
| `ATT-05` | Early Departure Tracking | Tracking departure prior to shift scheduled end time; partial deduction rules. | M10 | P0 | CONFIRMED |
| `ATT-06` | Single-Punch Anomaly Handling | Single punches default to `LONE_PUNCH_ANOMALY`; configurable tenant fallback (Review/Absent/Half). | M10 | P0 | CONFIRMED |
| `ATT-07` | Daily Rollup Calculation | Confirmed N66a: `DURATION_RATIO` default rollup mapping coverage to PRESENT, HALF_DAY, ABSENT. | M10 | P0 | CONFIRMED |
| `ATT-08` | Session Minimum Presence | Confirmed N66b: Session completeness qualified by minimum presence threshold. | M10 | P0 | CONFIRMED |
| `ATT-09` | Session-Targeted Half Leave | Confirmed N66c: Half-day leaves explicitly target First Half or Second Half scheduled session. | M10 | P0 | CONFIRMED |
| `ATT-10` | Attendance Regularization | Self-service punch miss regularization workflow requiring manager approval. | M10 | P0 | CONFIRMED |
| `ATT-11` | Immutable Explanation Trace | Persisting complete JSON explanation trace explaining exact rule inputs and intermediate math. | M10 | P0 | CONFIRMED |
| `ATT-12` | Manual Admin Overrides | Admin manual override of attendance status with mandatory reason code and audit log. | M10 | P0 | CONFIRMED |
| `ATT-13` | Multi-Day Continuous Duty | Duty windows >24h (36h/48h) attributed to start date; post-duty recovery marked REST. | M10 | P0 | CONFIRMED |
| `ATT-14` | Lone-Punch Guardrails | Strict prevention of phantom overtime or full-day pay on single/incomplete punches. | M10 | P0 | CONFIRMED |
| `ATT-15` | Read-vs-Write Decoupling | Guaranteed zero state mutations when viewing attendance screens or previewing reports. | M10 | P0 | CONFIRMED |

---

## 8. Leave Management & Holidays (`LVE`, `HOL`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LVE-01` | Double-Entry Leave Ledger | Leave transactions recorded as append-only entries with transaction type and running balance. | M11 | P0 | CONFIRMED |
| `LVE-02` | Configurable Leave Types | Annual Leave, Casual Leave, Sick Leave, Maternity/Paternity Leave, Compensatory Off, LOP. | M11 | P0 | CONFIRMED |
| `LVE-03` | Monthly / Annual Accruals | Automated periodic accrual rules with pro-rata calculation for mid-year joiners. | M11 | P1 | CONFIRMED |
| `LVE-04` | Sandwich Rule Engine | Configurable sandwich rules treating intervening weekly offs/holidays as leave days. | M11 | P0 | CONFIRMED |
| `LVE-05` | Carry-Forward & Lapse | Year-end processing with maximum carry-forward limits and automatic lapse or encashment. | M11 | P1 | CONFIRMED |
| `LVE-06` | Negative Balance Prevention | Strict validation preventing leave balance from going negative unless policy permits. | M11 | P0 | CONFIRMED |
| `HOL-01` | Holiday Master Calendars | Tenant and branch-specific holiday calendar management with optional/restricted holidays. | M11 | P0 | CONFIRMED |

---

## 9. Overtime Policies, Allowances & Comp-Off (`OTC`, `ALW`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `OTC-01` | Overtime Pre/Post Approval | Confirmed N20: Overtime hours require explicit supervisor approval before payroll credit. | M12 | P0 | CONFIRMED |
| `OTC-02` | Overtime Rate Multipliers | Configurable rate multipliers (e.g., 1.5x standard, 2.0x holiday/rest day under Factories Act). | M12 | P0 | CONFIRMED |
| `OTC-03` | Compensatory Off Credit | Option to credit approved overtime hours as compensatory leave balance instead of cash payout. | M12 | P1 | CONFIRMED |
| `OTC-04` | Maximum Overtime Caps | Daily, weekly, and quarterly statutory overtime hour caps with violation warnings. | M12 | P1 | CONFIRMED |
| `ALW-01` | Allowance Engine | Separation of configuration from calculation: fixed, percentage, on-call, night allowance. | M13 | P1 | CONFIRMED |

---

## 10. Payroll Engine, Statutory & Arrears (`PAY`, `STA`, `PSL`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PAY-01` | Guided 10-Step Pay Run | Deterministic 10-step wizard for monthly pay runs with pre-run reconciliation and locks. | M14 | P0 | CONFIRMED |
| `PAY-02` | Salary Structure Templates | Configurable earnings (Basic, HRA, Special Allowance) and deductions with formula builder. | M14 | P0 | CONFIRMED |
| `PAY-03` | Attendance-to-LOP Sync | Automated Loss of Pay (LOP) deduction based on finalized attendance ledger absent days. | M14 | P0 | CONFIRMED |
| `PAY-04` | Pay Group & Cut-Off Cycles | Configurable pay cycles (calendar month or cut-off e.g. 25th to 24th) per Pay Group. | M14 | P0 | CONFIRMED |
| `PAY-05` | Per-Session / Lecture Pay | Compensation formula for faculty/trainers based on verified session completion count. | M14 | P1 | CONFIRMED |
| `PAY-06` | Strict Period Lock & Arrears | Closed pay runs are immutable; retroactive corrections generate Arrears in next open cycle. | M14 | P0 | CONFIRMED |
| `PAY-07` | ERP Accounting Export | Direct export of payroll journal batches to Tally Prime XML, Zoho Books, and SAP formats. | M14 | P1 | CONFIRMED |
| `STA-01` | EPF Compliance Engine | 12% employee + 12% employer split with ₹15,000 ceiling, higher pension option, and ECR file. | M14 | P0 | CONFIRMED |
| `STA-02` | ESI Compliance Engine | 0.75% employee + 3.25% employer with ₹21,000 gross limit and contribution period rules. | M14 | P0 | CONFIRMED |
| `STA-03` | Professional Tax (PT) Engine | State-specific PT slabs with automatic February adjustment rules across all Indian states. | M14 | P0 | CONFIRMED |
| `STA-04` | TDS Income Tax Engine | Dual-regime calculation (Section 115BAC New vs Old Regime), declarations, Form 16 Part A/B. | M14 | P1 | CONFIRMED |
| `STA-05` | Labour Welfare Fund (LWF) | State-specific biannual or annual LWF deductions for covered industrial workers. | M14 | P1 | CONFIRMED |
| `PSL-01` | Server-Side PDF Payslip | Cryptographically signed, password-protected PDF payslips generated via server-side renderer. | M14 | P0 | CONFIRMED |
| `PSL-02` | Bank Disbursement File | Export of bank payment batches formatted for HDFC, ICICI, SBI, Axis (NEFT/RTGS CSV/NACH). | M14 | P0 | CONFIRMED |
| `PSL-03` | Pay Run Freeze & Snapshot | Complete point-in-time snapshot of salary components, tax slabs, and employee master at run time. | M14 | P0 | CONFIRMED |

---

## 11. Self-Service, Mobile & Workflows (`ESS`, `MOB`, `WFL`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ESS-01` | Employee Portal Dashboard | Web dashboard displaying monthly calendar, attendance status, leave balances, and payslips. | M15 | P0 | CONFIRMED |
| `MOB-01` | Mobile Geofenced Clock-In | Mobile app punch with GPS coordinate capture, geofence radius validation, and mock GPS check. | M19 | P1 | CONFIRMED |
| `MOB-02` | Offline Mobile Punch Sync | Offline SQLite queue with cryptographic timestamp signature and replay protection. | M19 | P1 | CONFIRMED |
| `WFL-01` | Configurable Approval Chains | Flexible 1-to-N tier approval workflow for leave, attendance regularization, and overtime. | M18 | P0 | CONFIRMED |
| `WFL-02` | Auto-Approval Rules | Confirmed Q6: Auto-approval of WFH within configured monthly quota without supervisor block. | M18 | P0 | CONFIRMED |
| `WFL-03` | Delegation & Out-of-Office | Temporary delegation of approval authority to designated peers during manager absence. | M18 | P1 | CONFIRMED |
| `NTF-01` | Multi-Channel Notifications | Official WhatsApp BSP, SMS, Email, and Push alerts for approvals, shift updates, and payslips. | M18 | P0 | CONFIRMED |

---

## 12. Lifecycle Automation & Field Tracking (`LFC`, `FLD`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LFC-01` | Auto-Promotion & Transitions | Automated transition pipelines: Trainee $\rightarrow$ Probation $\rightarrow$ Confirmed Full-Time Employee. | M21 | P2 | CONFIRMED |
| `LFC-02` | Probation Extension on LOP | Automatic extension of probation completion date by the count of unpaid leave (LOP) days. | M21 | P2 | CONFIRMED |
| `LFC-03` | Confirmation Policy Triggers | Automated trigger on confirmation date updating leave accruals and notice period bands. | M21 | P2 | CONFIRMED |
| `LFC-04` | Contract Expiry Alerts | Automated workflow notifications at T-30/T-15 days for expiring employment contracts. | M21 | P2 | CONFIRMED |
| `LFC-05` | Appraisal & Increment Tracking | Scheduled annual review dates with effective-dated salary increment versioning. | M21 | P2 | CONFIRMED |
| `FLD-01` | Tiered Field Geolocation | 4-tier tracking model (Level 1 Punch GPS to Level 4 Duty Route Tracking). | M20 | P2 | CONFIRMED |
| `FLD-02` | Geofenced Site Logging | Automated arrival and departure logging at customer sites, factories, or petrol pumps. | M20 | P2 | CONFIRMED |
| `FLD-03` | On-Duty Transparency Banner | Level 4 route tracking active strictly during shift hours with persistent on-screen banner. | M20 | P2 | CONFIRMED |
| `FLD-04` | Visit Check-In Proof | Field staff check-in recording location, notes, and photo proof-of-work. | M20 | P2 | CONFIRMED |

---

## 13. Reporting, Integration & Audit (`RPT`, `INT`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RPT-01` | Form 25 Statutory Muster Roll | Standard monthly attendance register compliant with Indian Factories Act and Shops & Est. | M17 | P0 | CONFIRMED |
| `RPT-02` | Daily Attendance Summary | Real-time daily dashboard and export showing present, absent, late, and on-leave counts. | M17 | P0 | CONFIRMED |
| `RPT-03` | Statutory Contribution Report | Consolidated monthly schedules for EPF ECR upload, ESI monthly return, and PT state filings. | M17 | P0 | CONFIRMED |
| `INT-01` | Tally XML Export | Export of finalized payroll journal entries formatted for direct import into Tally ERP/Prime. | M14 | P1 | CONFIRMED |
| `INT-02` | REST API Webhooks | Outbound event webhooks notifying external ERPs on pay run locked, employee onboarded. | M18 | P1 | CONFIRMED |

---

## 14. Security, Privacy & Non-Functional (`SEC`, `PRV`, `NFR`)

| ID | Title | Description | Module | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SEC-01` | Row-Level Security Enforcement | Strict RLS on all tenant-scoped tables; no application bypass permitted. | M01 | P0 | CONFIRMED |
| `SEC-02` | Field-Level PII Encryption | AES-256 encryption for Aadhaar, PAN, Bank Account, Salary figures at rest. | M04 | P0 | CONFIRMED |
| `PRV-01` | DPDP Act 2023 Compliance | Consent logging for biometric processing, purpose limitation, and employee data export. | M01 | P0 | CONFIRMED |
| `PRV-02` | Right to Erasure / Masking | Anonymization of former employee PII after statutory retention expiry. | M04 | P1 | CONFIRMED |
| `PRV-03` | Minor / Student Parental Consent| Mandatory verifiable parental/guardian consent prior to student data or biometric capture. | M01 | P0 | CONFIRMED |
| `NFR-01` | Ingestion Throughput | Minimum 10,000 raw punches/minute ingestion capacity with API response time < 200ms. | M09 | P0 | CONFIRMED |
| `NFR-02` | Audit Retention | Immutable retention of attendance and payroll ledgers for 8 fiscal years. | M01 | P0 | CONFIRMED |
| `NFR-03` | Infrastructure Cost Ceiling | Operational hosting cost capped at $\le ₹80$ per active employee per month. | M01 | P0 | CONFIRMED |
