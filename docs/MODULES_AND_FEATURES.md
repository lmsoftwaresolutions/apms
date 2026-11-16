# APMS — Complete Modules & Minute Features Catalog

This document provides the definitive, granular breakdown of all **21 functional modules** in APMS, detailing their minute features, operational workflows, formulas, and architectural guardrails.

---

## Foundational Architecture: The 3-Way Separation Model

Every capability in APMS is governed by three decoupled layers:
1. **Layer 1: Feature Flags (Module 02)** — *Is the feature enabled for this tenant?* (e.g., Payroll ON/OFF, Level 4 GPS ON/OFF).
2. **Layer 2: Tenant Policies (Module 06)** — *How does the feature behave?* Evaluated via the Policy Hierarchy:
   $$\text{Org Policy} \longrightarrow \text{Branch Policy} \longrightarrow \text{Department Policy} \longrightarrow \text{Employee Exception} \Longrightarrow \text{Effective Policy}$$
3. **Layer 3: User Permissions (Module 03)** — *Who has authority to execute the action?* (Granular RBAC execution rights).

---

# P0: Foundation & Core Processing Engines

### M01: Super Admin & Tenant Management
*Core Purpose: Multi-tenant platform orchestration, automated onboarding, usage telemetry, and cross-tenant diagnostic tools.*

- **Tenant Provisioning & Onboarding**:
  - Automated tenant registration wizard with dedicated subdomain assignment (`tenant.apms.com`).
  - Deployment cell placement: Multi-tenant shared PostgreSQL pool vs. dedicated isolated database cell for premium enterprise tiers.
  - Initial Super-Admin provisioning with secure invite link and forced password reset.
  - Tenant Sandbox Mode: Allows HR to simulate pay runs and test shift rules using dummy test data before going live.
- **Subscription & Quota Management**:
  - Flexible tier plans: Starter, Growth, Enterprise.
  - Usage-based billing: Billed strictly on **Monthly Active Attendance-Tracked Users (MAU)**.
  - Student vs. employee parity: Educational institutions billed on active tracked students at volume-discounted rates.
  - Configurable hard/soft employee quota limits with grace-period alerts before blocking new enrollments.
- **Tenant Lifecycle Governance**:
  - Lifecycle states: `ACTIVE`, `GRACE_PERIOD`, `SUSPENDED` (read-only access), `DEACTIVATED`, `PURGED`.
  - Automated billing freeze and data archival upon tenant deactivation.
- **Support & Platform Diagnostics**:
  - Audited impersonation: Platform engineers can access tenant console with explicit reason logging and time-limited tokens.
  - Real-time tenant health dashboards: Displays active API throughput, background queue backlog, and database connection pool health.
- **Data Residency & Governance**:
  - Guaranteed India-only data residency across primary storage and backup snapshots.
  - Automated statutory retention management complying with 8-year fiscal record laws.

---

### M02: Feature Flag Management (Layer 1)
*Core Purpose: Per-tenant modular capability toggling without code deployments.*

- **Granular Module Switches**:
  - Independent ON/OFF toggles for all 21 modules (e.g., Tenant A uses Attendance only; Tenant B enables Attendance + Payroll; Tenant C enables Education).
- **Sub-Feature Capability Flags**:
  - Toggle Level 4 continuous GPS tracking per tenant.
  - Toggle Sandwich rule engine per tenant.
  - Toggle WhatsApp notification dispatch per tenant.
  - Toggle Multi-Day 24h/36h hospital shift engine per tenant.
- **Pilot & Canary Releases**:
  - Roll out experimental features to specific tenant cohorts (e.g., 5 pilot factories) before general availability.
- **Zero-Downtime Cache Invalidation**:
  - Feature flag updates write to PostgreSQL and instantly broadcast invalidation events over Redis Pub/Sub to edge API instances in <50ms.

---

### M03: User & Role-Based Access Control (RBAC - Layer 3)
*Core Purpose: Identity verification, granular permission enforcement, and session security.*

- **Standard & Custom System Roles**:
  - `PLATFORM_ADMIN`: Global cross-tenant infrastructure access.
  - `TENANT_ADMIN`: Full configuration and organizational control within a single tenant.
  - `HR_OPERATIONS`: Manages payroll execution, attendance regularizations, leave policies, and employee master.
  - `SHIFT_SUPERVISOR` / `MANAGER`: Manages roster assignments, approves leaves, authorizes overtime, and overrides shifts.
  - `EMPLOYEE`: Access to personal attendance, leave ledger, punch miss requests, and digital payslips.
  - `AUDITOR`: Read-only access to audit trails, muster rolls, and statutory calculation explanations.
  - `STUDENT` & `GUARDIAN`: Access to academic timetable, attendance history, and homework logs.
- **Fine-Grained Permission Matrix**:
  - Atomic action permissions (e.g., `attendance:read`, `attendance:regularize`, `payroll:run`, `payroll:lock`, `leave:approve`).
- **Session & Token Management**:
  - Dual-token authentication: Short-lived JWT access tokens (15-minute expiration) and secure HTTP-only refresh tokens (7-day rotation).
  - Immediate token revocation on password reset or administrative session termination.
- **Multi-Factor Authentication (MFA)**:
  - Time-based One-Time Password (TOTP) compatible with Google Authenticator, Microsoft Authenticator, and Authy.
  - Mandatory MFA enforcement for `TENANT_ADMIN` and `HR_OPERATIONS` roles.
- **Enterprise Single Sign-On (SSO)**:
  - SAML 2.0 and OpenID Connect (OIDC) integration for Microsoft Entra ID (Azure AD), Google Workspace, and Okta.

---

### M04: Employee Master & Profiles
*Core Purpose: Unified workforce identity, lifecycle terms, and field-level encrypted PII repository.*

- **Universal Person Identity**:
  - A single core identity schema capable of supporting employees, contractors, interns, trainees, students, and guardians.
- **Master Demographic & Employment Data**:
  - Unique Employee Code / Student ID, full name, DOB, gender, blood group, emergency contacts, permanent/current address.
  - Professional attributes: Date of joining, confirmation date, branch, department, designation, grade, cost center, and reporting manager.
- **Field-Level PII Envelope Encryption**:
  - Sensitive identifiers (Aadhaar Number, PAN, Bank Account Number, IFSC code, base wage figures) are encrypted at rest using AES-256 with tenant-specific encryption keys.
  - Audited unmasking: Viewing unmasked bank or identity details requires a reason prompt and logs an immutable audit event.
- **Document Management Vault**:
  - Encrypted document storage for appointment letters, signed contracts, educational certificates, identity proofs, and driving licenses.
- **Dual Reporting & Multi-Level Lines**:
  - Supports primary administrative manager (HR approval line) and functional shift manager (daily roster line).
  - Recursive organizational hierarchy queries via PostgreSQL Common Table Expressions (CTEs).

---

### M05: Organization Management
*Core Purpose: Enterprise structure modeling, cost centers, and multi-timezone settings.*

- **Multi-Tier Hierarchy**:
  - Legal Entities (Companies) $\rightarrow$ Physical Branches / Plants $\rightarrow$ Departments $\rightarrow$ Sub-Departments $\rightarrow$ Cost Centers.
- **Branch-Specific Timezone Governance**:
  - Every branch defines its local timezone (e.g., `Asia/Kolkata`). All punch events and audit trails are stored internally in UTC and converted deterministically to branch local time.
- **Financial Year & Pay Calendars**:
  - Configuration of statutory financial years (e.g., April 1 to March 31 for India) and operational monthly pay periods.
- **Physical Geofence Boundary Registry**:
  - Centralized registry of workplace coordinates (latitude, longitude) and permissible radial geofence zones (e.g., 50 meters, 100 meters) for mobile clock-ins.

---

### M06: Policy & Rules Engine (Layer 2)
*Core Purpose: Deterministic rule resolution, hierarchy inheritance, and temporary exceptions.*

- **4-Tier Policy Hierarchy**:
  - Inherits from Org $\rightarrow$ Branch $\rightarrow$ Department $\rightarrow$ Employee Exception.
  - More specific rules automatically override broader organizational defaults.
- **Effective Dating & Versioning**:
  - Every policy carries `effective_from` and `effective_to` dates. Historical attendance calculations always evaluate against the policy active on that specific calendar date.
- **Exception Management Workflow**:
  - Temporary policy overrides (e.g., granting 10 extra WFH days to Employee X due to an injury) with required approvals and automated expiry.
- **Complete Rule Audit History**:
  - Full before/after snapshot logged whenever a grace period, late mark threshold, or overtime multiplier is altered.

---

### M07: Shift Management
*Core Purpose: Working hour models, break deductions, and complex shift definitions.*

- **Diverse Shift Template Engine**:
  - **Fixed Shifts**: Standard fixed start and end times (e.g., 09:00 to 18:00).
  - **Flexible Window Shifts**: Core presence hours (e.g., 11:00 to 16:00) with flexible total worked duration requirements (e.g., 8 hours).
  - **Overnight Shifts**: Cross-midnight shifts (e.g., 22:00 to 06:00 next day) with unambiguous boundary attribution to the start date.
  - **Multi-Session Split Shifts**: Multiple scheduled working blocks (e.g., 08:00–12:00 and 16:00–20:00) with N65 mid-shift gap exclusion.
  - **Continuous Multi-Day Duties (>24h / 36h / 48h)**: Long-duration medical and emergency plant shifts anchored to the starting calendar date.
- **Auto-Shift Allocation & Dynamic Shift Matching (Shift Pooling)**:
  - **Multi-Shift Pool Assignment**: Assign an employee or department a pool of multiple eligible shifts (e.g., `[Morning: 06:00–14:00, Afternoon: 14:00–22:00, Night: 22:00–06:00]`).
  - **Dynamic In/Out Punch Resolution**: When the employee punches, the engine automatically matches their clock-in/out timestamps against candidate shift ingestion windows with the lowest arrival delta ($\Delta = |P_{in} - T_{start}|$).
  - Eliminates manual daily rostering for floating, rotating, or unscheduled shift workers.
  - Tie-breaking: Evaluates OUT punch duration or maximum shift overlap; unresolved punches route to the exception queue.
  - Full audit logging: Explanation trace records `resolution_mode = "AUTO_DYNAMIC_MATCH"` with candidate shift evaluations.
- **Tolerances & Penalty Thresholds**:
  - Arrival grace window (e.g., 15 mins).
  - Late arrival penalty bands (e.g., 3 late arrivals in a month = 0.5-day leave deduction).
  - Early departure tolerance and minimum half-day / full-day presence thresholds.
- **Break Policies**:
  - Paid vs. unpaid breaks; automatic deduction vs. mandatory punch-out break enforcement.
- **Shift Definition Versioning**:
  - Modifying shift timings generates a new version; past attendance logs remain tied to historical shift definitions.

---

### M08: Workforce Scheduling & Roster
*Core Purpose: Shift allocations, rotation schedules, and ad-hoc same-day modifications.*

- **Pattern-Based Roster Generator**:
  - Generates recurring cycles (e.g., 6 days on / 1 day off; weekly rotational Morning $\rightarrow$ Evening $\rightarrow$ Night; 24/7 cyclical teams).
- **Bulk Allocation & Roster Cloning**:
  - One-click shift assignments across entire departments, branches, or employee grades.
  - Duplicate roster schedules across weeks or months with conflict detection.
- **Dated Shift Instance Materialization**:
  - Roster patterns expand into immutable database records (`dated_shift_instance`) up to 60 days in advance.
- **Ad-Hoc Same-Day Overrides (N67)**:
  - Supervisor direct override: Manager reassigns shift instance for date $D$ without altering master recurring templates.
  - Employee shift swap: Mutual exchange between two employees requiring supervisor approval.
- **Management-Cancelled Sessions (N66d)**:
  - Management cancellations (e.g., school strike, factory power outage) marked `CANCELLED_PAID` for salaried staff or configurable retainer for per-session staff.

---

### M09: Raw Punch Engine
*Core Purpose: High-throughput immutable punch ingestion, deduplication, and hardware mapping.*

- **Append-Only Ingestion Gateway**:
  - Punches written to `raw_envelope` with SHA-256 payload hash (`sha256(tenant_id, device_id, raw_body)`).
  - Sustains 10,000 raw punches/minute with <200ms latency.
- **Universal Multi-Source Ingestion**:
  - Biometric terminals (Time Office HTTP, ZKTeco ADMS push, eSSL SDK).
  - Office Mounted Phone / Tablet Kiosk.
  - Personal Mobile ESS (Geofenced, GPS, WFH).
  - CCTV Walk-Through Facial Recognition.
  - Bulk CSV / Excel punch log import.
- **Idempotency & Debounce Window**:
  - Consecutive punches for the same employee within 60 seconds are marked `DUPLICATE_IGNORED`.
- **Clock Drift Detection & Alerts**:
  - Compares device local punch timestamp against server `received_at`. If drift $> \pm 5\text{ minutes}$, flags `CLOCK_DRIFT_WARNING` and notifies device admin.
- **Out-of-Order Recalculation Triggers**:
  - Late-arriving punches automatically trigger an asynchronous re-pairing job for the affected calendar date.

---

### M10: Attendance Calculation Engine
*Core Purpose: 7-step deterministic attendance evaluation, rollup status, and immutable explanation traces.*

- **7-Step Processing Pipeline**:
  - Step 1: Raw Ingestion $\rightarrow$ Step 2: Normalization $\rightarrow$ Step 3: Pairing $\rightarrow$ Step 4: Shift Resolution $\rightarrow$ Step 5: Policy Evaluation $\rightarrow$ Step 6: Exception Queue $\rightarrow$ Step 7: Period Lock.
- **Session-Aware Chronological Pairing**:
  - Evaluates punches within configured session ingestion windows $[T_{start} - W_{pre}, T_{end} + W_{post}]$ instead of blind 24-hour pairing.
- **Multi-Session Mid-Shift Gap Exclusion (N65)**:
  - Intervals between scheduled sessions in split shifts are strictly non-working time, excluded from worked hours and OT.
- **Daily Rollup Calculation (`DURATION_RATIO` - N66a)**:
  - Coverage ratio $R = \sum \text{Worked} / \sum \text{Scheduled}$.
  - Maps to: `PRESENT` ($R \ge 0.90$), `HALF_DAY` ($0.50 \le R < 0.90$), or `ABSENT` ($R < 0.50$).
- **Session Minimum Presence Qualification (N66b)**:
  - Each session must meet $\mu \times \text{Duration}$ (default 50%). If one session in a 2-session split shift is `BELOW_MIN`, daily status is capped at `HALF_DAY`.
- **Configurable Lone-Punch Policies (Q4)**:
  - Lone punches default to `LONE_PUNCH_ANOMALY` and route to HR review.
  - Fallback options at payroll cut-off: Mark `ABSENT` with LOP, or assign floor `HALF_DAY` credit.
  - Strict guardrail: A lone punch **never** generates overtime or unearned full-day pay.
- **Split WFH Minute Accounting**:
  - Cumulative sum of verified remote minutes, capped at scheduled shift maximum to prevent phantom OT.
- **Read-vs-Write Decoupling**:
  - Viewing attendance screens or generating reports executes strictly in read-only mode (`SELECT`) with zero state mutations.
- **Immutable JSON Explanation Trace**:
  - Every daily attendance record persists its exact inputs, formulas, session breakdown, and rule evaluations in `attendance_explanation_traces`.

---

# P1: Business Operations

### M11: Leave & Holiday Management
*Core Purpose: Double-entry leave ledgers, dynamic leave types, and sandwich rule evaluation.*

- **Double-Entry Append-Only Ledger (`LVE-01`)**:
  - Every leave mutation is an append-only entry in `leave_transactions` (accruals, applications, debits, lapses, encashments).
  - Balances are derived dynamically; no mutable scalar balance columns.
- **Dynamic Configurable Leave Types**:
  - Annual/Earned Leave (AL/EL), Casual Leave (CL), Sick Leave (SL), Maternity Leave, Paternity Leave, Comp-Off, Loss of Pay (LOP).
- **Automated Pro-Rata Accrual Engine**:
  - Monthly or annual credit rules with automated pro-rata computation for new hires.
- **Sandwich Rule Engine (`LVE-04`, `BR-LVE-02`)**:
  - Intervening Weekly Offs (WO) or Holidays (HOL) are automatically converted to leave/LOP if the employee is absent on both the preceding and succeeding workdays.
- **Session-Targeted Half-Day Leave (`ATT-09`, `BR-ROL-04`)**:
  - Half-day leave applications explicitly target either the **First Half** or **Second Half** scheduled session.
- **Negative Balance Prevention & LOP Auto-Conversion**:
  - Blocks applications exceeding balance unless advance leave is explicitly enabled; uncredited days convert to `LOSS_OF_PAY`.
- **Branch Holiday Calendars (`HOL-01`)**:
  - Branch-specific holiday lists supporting mandatory national holidays and optional/restricted regional holidays.
- **Year-End Carry-Forward & Encashment**:
  - Automated year-end rollover enforcing carry-forward caps, encashment payouts, or balance lapse.

---

### M12: Overtime & Comp-Off
*Core Purpose: Overtime pre/post authorizations, statutory rate multipliers, and comp-off credits.*

- **Pre- & Post-Shift Authorization Workflows (N20)**:
  - Overtime hours require supervisor pre-authorization or post-shift sign-off before entering payroll. Unapproved extra time is marked `UNAUTHORIZED_EXTRA_TIME` and excluded.
- **Factories Act Statutory Multipliers**:
  - Configurable rate multipliers: Standard workday OT (1.5x), Rest day / Holiday OT (2.0x).
- **Statutory Overtime Caps**:
  - Enforces daily (e.g. 2 hours), weekly, and quarterly statutory limits (e.g. max 50 hours per quarter under Indian Factories Act).
- **Overtime-to-Compensatory Off Conversion**:
  - Allows employees to convert approved OT hours into compensatory off leave balance with configurable expiration windows (e.g., 60 days).

---

### M13: Allowance & Compensation Engine
*Core Purpose: Complex earnings calculation decoupled from base salary structures.*

- **Decoupled Configuration vs. Calculation**:
  - Allowance rules, conditions, and eligibility bands reside in database tables, separate from wage formulas.
- **Flexible Allowance Models**:
  - Fixed monthly, percentage of basic, per-day presence, per-hour worked, per-session completed.
- **Specialized Industry Allowances**:
  - Hospital on-call allowances, locum doctor per-case payouts, night shift hazard allowances, continuous long-duty allowances (>16h).
- **Conditional Eligibility Rules**:
  - Automated qualification gates (e.g., attendance bonus requires zero late marks and 100% presence).

---

### M14: Payroll Management & Statutory Compliance
*Core Purpose: 10-step guided pay runs, Indian statutory engines, bank files, and strict period locking.*

- **Guided 10-Step Pay Run Wizard**:
  - Step 1: Attendance reconciliation $\rightarrow$ Step 2: Leave freeze $\rightarrow$ Step 3: Variable earnings/deductions $\rightarrow$ Step 4: Overtime authorization $\rightarrow$ Step 5: Gross salary computation $\rightarrow$ Step 6: Statutory deductions $\rightarrow$ Step 7: Pre-run variance check (>20% difference alert) $\rightarrow$ Step 8: Period lock & snapshot $\rightarrow$ Step 9: Bank disbursement files $\rightarrow$ Step 10: Payslip publication.
- **Salary Structure Builder**:
  - Earnings (Basic, HRA, Conveyance, Special Allowance) and Deductions with custom mathematical formula builder.
- **Automated Loss of Pay (LOP) Sync**:
  - Deducts salary based on finalized attendance ledger absent days using pay-group daily wage formulas ($\text{Gross} / \text{Days in Month}$).
- **Indian Statutory Compliance Engine**:
  - **EPF / EPS**: ₹15,000 wage ceiling, 12% employee contribution, employer 8.33% EPS (capped at ₹1,250) + 3.67% EPF, EDLI 0.5%, Admin 0.5%, and standard EPFO ECR text export.
  - **ESI**: ₹21,000 gross wage ceiling, 0.75% employee, 3.25% employer, contribution period locks, and ESI return file generation.
  - **Professional Tax (PT)**: State-specific slabs across all Indian states with automated February gross adjustment.
  - **Labour Welfare Fund (LWF)**: State biannual deductions (e.g., Maharashtra June and December deductions).
  - **TDS Income Tax (Section 192)**: Dual regimes (Old Regime vs. Section 115BAC New Regime), employee declaration verification, monthly projected tax withholding, Form 16 Part A & B generation.
- **Cryptographic Server-Side Payslips**:
  - Server-rendered, password-protected PDF payslips published directly to ESS.
- **Disbursement & Accounting Exports**:
  - Bank payment batch files: NEFT/RTGS/NACH CSV formats for HDFC, ICICI, SBI, Axis Bank.
  - ERP Accounting Journal Exports: Direct export of payroll journal vouchers to Tally Prime XML, Zoho Books, and SAP RFC.
- **Strict Period Close Lock & Arrears Engine (`PAY-06`)**:
  - Finalized pay periods are locked permanently.
  - Backdated attendance regularizations or retroactive salary increments generate an **Arrears Adjustment in the next open pay cycle**, never mutating closed historical runs.

---

### M15: Employee Self-Service (ESS Web & Mobile)
*Core Purpose: Personal attendance, regularization requests, leave applications, and digital payslips.*

- **Personal Attendance Calendar**:
  - Real-time view of daily punches, worked hours, late marks, shift assignments, and status badges.
- **Punch Miss Regularization**:
  - Employee requests punch miss corrections with mandatory reason selection and supporting attachment.
- **Leave Application & Simulator**:
  - Real-time leave balance ledger view; simulator displays post-application balance before submission.
- **Shift Swap Requests**:
  - Select an eligible colleague to swap upcoming shift assignments with mutual consent.
- **Financial Documents**:
  - Instant download of monthly PDF payslips and annual Tax Computation sheets.

---

### M16: Device Integrations & Telemetry
*Core Purpose: Hardware connectivity, sync health monitoring, and edge kiosks.*

- **Native Biometric Adapters**:
  - Direct integration with Time Office HTTP API, ZKTeco ADMS push protocol, and eSSL SDK.
- **Local Edge Sync Agent (`PCH-04`)**:
  - Lightweight Python/Rust daemon running on the local factory network to poll USB/LAN devices and relay punches to cloud APIs during network windows.
- **Real-Time Device Telemetry & Sync Health**:
  - 60-second heartbeat monitoring; alerts triggered if a device stops communicating.
  - Sync queue lag tracking: Alerts when device-to-cloud delivery exceeds 15 minutes.
  - Automated NTP clock drift check: Flags devices whose hardware clocks drift by $> \pm 5\text{ minutes}$.
- **Shared Tablet / Kiosk Mode (`DEV-03`)**:
  - Android tablet / mounted smartphone app with PIN/QR authentication + instant edge selfie facial verification.
  - Offline encrypted SQLite cache with automatic cloud sync upon network recovery.
- **Biometric Security Invariant (`BR-BIO-01`)**:
  - Fingerprint and facial templates remain stored strictly inside the physical biometric terminal hardware; raw biometric templates are never uploaded to the cloud database.

---

### M17: Reports & Analytics
*Core Purpose: Statutory registers, compliance exports, and real-time operational dashboards.*

- **Statutory Muster Roll (Form 25)**:
  - Fully compliant with Indian Factories Act and state Shops & Establishments regulations.
- **Daily Executive Dashboards**:
  - Real-time presenteeism, absenteeism, tardiness, and on-leave headcount metrics filtered by branch, department, or shift.
- **Statutory Schedules**:
  - Consolidated monthly filing schedules for EPF ECR, ESI returns, and PT state challans.
- **Multi-Format Export Engine**:
  - Instant export to Excel (.xlsx), CSV, PDF, and Tally Prime XML.

---

### M18: Workflow & Notifications Hub
*Core Purpose: Multi-tier approval orchestration, auto-approval quotas, and multi-channel messaging.*

- **Configurable Multi-Tier Approval Chains**:
  - 1-to-N tier sequential or parallel approvals (e.g., Employee $\rightarrow$ Manager $\rightarrow$ HR Ops).
- **Out-of-Office Delegation**:
  - Temporarily delegate approval authority to a peer during manager leave with complete audit trails.
- **SLA Timeouts & Auto-Escalation**:
  - Automatic reminders (at 24h and 48h) and escalation to department head if requests remain unacted.
- **Work-From-Home Auto-Approval Quotas (`WFL-02`, `BR-WFH-01`)**:
  - Configurable monthly WFH quota (e.g., 4 days/month) auto-approved immediately without blocking on manager review.
- **Multi-Channel Dispatch Engine**:
  - Official WhatsApp Business API (BSP), transactional SMS, branded HTML email, and mobile push notifications.

---

# P2: Extensions & Specializations

### M19: Mobile Application & Geofence
*Core Purpose: Native mobile workforce client with geofencing and offline resilience.*

- **Native iOS & Android Client**:
  - Built with offline-first architecture for field and corporate staff.
- **Geofenced Clock-In**:
  - Validates GPS coordinates against authorized branch coordinates and radius (e.g. 50 meters).
  - Built-in anti-spoofing detects mock GPS applications and developer-mode mock locations.
- **Offline Punch Queue (`MOB-02`)**:
  - Stores clock-in events in local encrypted SQLite database with cryptographic timestamp signatures and replay protection.

---

### M20: Advanced Workforce & Field Tracking
*Core Purpose: Tiered field staff location tracking, forecourt operations, and academic workflows.*

- **4-Tier Field Geolocation Model**:
  - **Level 1 (Punch GPS)**: Coordinates captured strictly at the instant of Clock-In / Clock-Out.
  - **Level 2 (Geofenced Site Visits)**: Automated arrival/departure logging at client sites, plants, or petrol pumps.
  - **Level 3 (Visit Check-Ins)**: Field staff check in with visit notes, customer name, and photo proof-of-work.
  - **Level 4 (Duty-Hours Route Tracking)**: Continuous GPS coordinate tracking active **strictly during scheduled shift hours** with a persistent on-duty notification banner (zero tracking off-duty).
- **PumpOps Forecourt Integration**:
  - Specialized petrol pump attendant shift handover, fuel dispenser reading capture, and cash/card reconciliation.
- **Educational Module**:
  - Academic year and term setup, class and batch management, student attendance registers, timetable management, homework assignments, and guardian notifications.

---

### M21: Auto-Promotion & Lifecycle Automation
*Core Purpose: Automated employee progression, probation transitions, and contract renewal workflows.*

- **Automated Status Progression Pipelines**:
  - Status pipeline: `Trainee` $\longrightarrow$ `Probationary Employee` $\longrightarrow$ `Confirmed Full-Time Employee`.
  - Intern $\longrightarrow$ Full-Time Employee.
- **Automated Confirmation Review Milestones**:
  - Automated review workflow dispatched to reporting manager at T-30, T-15, and T-7 days prior to confirmation date.
  - Manager options: Approve confirmation, extend probation (with mandatory reason code), or initiate separation.
- **Probation Extension on Unpaid Leave (LOP)**:
  - If configured by tenant policy, unpaid leave days taken during probation automatically extend the probation end date by the exact count of LOP days:
    $$\text{Adjusted Probation End} = \text{Original Probation End} + \text{LOP Days}$$
- **Confirmation Policy Triggers**:
  - Confirmation effective date automatically unlocks full earned leave accruals and updates notice period bands.
- **Contract Expiry & Renewal Alerts**:
  - Automated notification workflow at T-30 and T-15 days for fixed-term contract renewals.
- **Appraisal & Increment Scheduling**:
  - Annual appraisal review scheduling with effective-dated salary increment versions.

---

## Universal Non-Negotiable Guardrails

1. **Multi-Tenant Row-Level Security (RLS)**: Every tenant-scoped table enforces PostgreSQL 16+ RLS on `tenant_id`.
2. **Infrastructure Cost Ceiling**: Total hosting and compute infrastructure cost is strictly capped at **$\le ₹80$ per active employee per month**.
3. **Edge AI & Biometrics**: Facial recognition runs on-device or local edge kiosk. Raw biometric templates remain on physical hardware; plain-text biometric templates are never stored in the cloud.
4. **DPDP Act 2023 Compliance**: Explicit consent logging, purpose limitation, and mandatory verifiable parental/guardian consent for students and minors.
5. **Zero Historical Mutation**: Finalized periods are locked; retroactive corrections route to the next open cycle as **Arrears**.
