# APMS — Domain & Codebase Glossary

> **Document Type:** Master Domain Glossary & Concept Reference  
> **Status:** Authoritative  
> **Source Documents:** [`CONTEXT.md`](../CONTEXT.md) · [`docs/requirements/BUSINESS_RULES.md`](requirements/BUSINESS_RULES.md) · [`docs/product/SRS.md`](product/SRS.md)

---

## Table of Contents

1. [Scheduling, Shifts & Roster Terminology](#1-scheduling-shifts--roster-terminology)
   - [Shift Template (`ShiftTemplate`)](#shift-template-shifttemplate)
   - [Shift Types: FIXED, SPLIT, OVERNIGHT, CONTINUOUS](#shift-types-fixed-split-overnight-continuous)
   - [Session (`SessionWindow` / `ShiftSession`)](#session-sessionwindow--shiftsession)
   - [Pre-Session Window (`pre_window_minutes` / $W_{pre}$)](#pre-session-window-pre_window_minutes--w_pre)
   - [Post-Session Window (`post_window_minutes` / $W_{post}$)](#post-session-window-post_window_minutes--w_post)
   - [Session Ingestion Window](#session-ingestion-window)
   - [Mid-Session Gap / Split-Shift Gap (Confirmed N65)](#mid-session-gap--split-shift-gap-confirmed-n65)
   - [Intra-Session Break (`break_duration_minutes`)](#intra-session-break-break_duration_minutes)
   - [Overnight Shift & Commencement Date Attribution (BR-ATT-03)](#overnight-shift--commencement-date-attribution-br-att-03)
   - [Continuous Multi-Day Duty Window (>24h / 36h / 48h)](#continuous-multi-day-duty-window-24h--36h--48h)
   - [Post-Duty Rest (`POST_DUTY_REST`)](#post-duty-rest-post_duty_rest)
   - [Roster Pattern (`RosterPattern`)](#roster-pattern-rosterpattern)
   - [Forward Materialization](#forward-materialization)
   - [Dated Shift Instance (`DatedShiftInstance`)](#dated-shift-instance-datedshiftinstance)
   - [Rest Day / Weekly Off (`REST_DAY` / `WO`)](#rest-day--weekly-off-rest_day--wo)
   - [Ad-Hoc Schedule Override (Confirmed N67)](#ad-hoc-schedule-override-confirmed-n67)
   - [Employer-Cancelled Session (`CANCELLED_PAID`, Confirmed N66d)](#employer-cancelled-session-cancelled_paid-confirmed-n66d)
2. [Punches, Hardware & Ingestion Terminology](#2-punches-hardware--ingestion-terminology)
   - [Raw Envelope (`raw_envelope`)](#raw-envelope-raw_envelope)
   - [Punch Event (`punch_event`)](#punch-event-punch_event)
   - [Canonical Punch (`CanonicalPunch`)](#canonical-punch-canonicalpunch)
   - [Device Adapter & SPI (Service Provider Interface)](#device-adapter--spi-service-provider-interface)
   - [Device Identifier (`device_identifier`)](#device-identifier-device_identifier)
   - [Debounce Window & Deduplication (BR-PCH-01)](#debounce-window--deduplication-br-pch-01)
   - [Duplicate Ignored (`DUPLICATE_IGNORED`)](#duplicate-ignored-duplicate_ignored)
   - [Active Punch (`ACTIVE`)](#active-punch-active)
   - [Clock Drift Warning (`CLOCK_DRIFT_WARNING`)](#clock-drift-warning-clock_drift_warning)
   - [Out-of-Order (OOO) Reprocessing](#out-of-order-ooo-reprocessing)
   - [Edge-Only Biometric Templates (BR-BIO-01)](#edge-only-biometric-templates-br-bio-01)
3. [Attendance Processing & Daily Rollup Terminology](#3-attendance-processing--daily-rollup-terminology)
   - [Chronological Pairing (BR-ATT-01)](#chronological-pairing-br-att-01)
   - [Session Pairing Result (`SessionPairingResult`)](#session-pairing-result-sessionpairingresult)
   - [Daily Pairing Result (`DailyPairingResult`)](#daily-pairing-result-dailypairingresult)
   - [Daily Rollup Decision (`DailyRollupDecision`)](#daily-rollup-decision-dailyrollupdecision)
   - [Duration Ratio Mode (`DURATION_RATIO`, Confirmed N66a)](#duration-ratio-mode-duration_ratio-confirmed-n66a)
   - [Worked Ratio ($R$)](#worked-ratio-r)
   - [Policy Threshold Bands ($\theta_{present}, \theta_{half\_day}$)](#policy-threshold-bands-theta_present-theta_half_day)
   - [Daily Attendance Statuses: PRESENT, HALF_DAY, ABSENT, NEEDS_REVIEW, REST_DAY](#daily-attendance-statuses-present-half_day-absent-needs_review-rest_day)
   - [Session Minimum-Presence Threshold ($\mu_j$, Confirmed N66b)](#session-minimum-presence-threshold-mu_j-confirmed-n66b)
   - [Session Eligibility: COMPLETED vs BELOW_MIN](#session-eligibility-completed-vs-below_min)
   - [Split-Shift Status Cap (Confirmed N66b)](#split-shift-status-cap-confirmed-n66b)
   - [Lone-Punch Anomaly (`LONE_PUNCH_ANOMALY`, Confirmed Q4)](#lone-punch-anomaly-lone_punch_anomaly-confirmed-q4)
   - [Overtime (OT / `overtime_minutes`)](#overtime-ot--overtime_minutes)
   - [Unauthorized Extra Time (`UNAUTHORIZED_EXTRA_TIME`, Confirmed N20)](#unauthorized-extra-time-unauthorized_extra_time-confirmed-n20)
   - [Late Arrival (`late_minutes`)](#late-arrival-late_minutes)
   - [Early Departure / Early Exit (`early_departure_minutes` / `early_exit_minutes`)](#early-departure--early-exit-early_departure_minutes--early_exit_minutes)
   - [Attendance Regularization (`ATT-10`)](#attendance-regularization-att-10)
   - [Muster Roll / Form II Register](#muster-roll--form-ii-register)
   - [Immutable Explanation Trace (`AttendanceExplanationTrace`)](#immutable-explanation-trace-attendanceexplanationtrace)
4. [Leave & Holiday Management Terminology](#4-leave--holiday-management-terminology)
   - [Double-Entry Leave Ledger (`leave_transactions`)](#double-entry-leave-ledger-leave_transactions)
   - [Leave Types (CL, SL, PL/EL, ML, Comp-Off)](#leave-types-cl-sl-plel-ml-comp-off)
   - [Session-Targeted Half-Day Leave (Confirmed N66c)](#session-targeted-half-day-leave-confirmed-n66c)
   - [Sandwich Rule (BR-LVE-02)](#sandwich-rule-br-lve-02)
   - [Loss of Pay (LOP)](#loss-of-pay-lop)
   - [Negative Balance Lock (`allow_negative_balance`)](#negative-balance-lock-allow_negative_balance)
   - [Compensatory Off (Comp-Off)](#compensatory-off-comp-off)
5. [Statutory & Indian Payroll Terminology](#5-statutory--indian-payroll-terminology)
   - [10-Step Payroll Wizard](#10-step-payroll-wizard)
   - [Pay Run (`pay_run`)](#pay-run-pay_run)
   - [Period Lock & Next-Cycle Arrears Routing (BR-PAY-12)](#period-lock--next-cycle-arrears-routing-br-pay-12)
   - [EPF (Employees' Provident Fund)](#epf-employees-provident-fund)
   - [EPS (Employees' Pension Scheme)](#eps-employees-pension-scheme)
   - [EDLI (Employees' Deposit Linked Insurance)](#edli-employees-deposit-linked-insurance)
   - [ESI (Employees' State Insurance)](#esi-employees-state-insurance)
   - [PT (Professional Tax)](#pt-professional-tax)
   - [TDS (Tax Deducted at Source, Section 192 & Section 115BAC)](#tds-tax-deducted-at-source-section-192--section-115bac)
   - [LWF (Labour Welfare Fund)](#lwf-labour-welfare-fund)
   - [OSH Code (Occupational Safety, Health and Working Conditions Code)](#osh-code-occupational-safety-health-and-working-conditions-code)
   - [Fixed Gross vs Earned Gross](#fixed-gross-vs-earned-gross)
   - [Daily Wage Rate Divisor](#daily-wage-rate-divisor)
   - [Payslip Snapshot](#payslip-snapshot)
6. [Organization, Security & Platform Terminology](#6-organization-security--platform-terminology)
   - [Multi-Tenancy & Tenant Isolation](#multi-tenancy--tenant-isolation)
   - [Row-Level Security (RLS) & `app.current_tenant_id`](#row-level-security-rls--appcurrent_tenant_id)
   - [Composite Foreign Key `(tenant_id, foreign_id)`](#composite-foreign-key-tenant_id-foreign_id)
   - [Organization / Legal Entity](#organization--legal-entity)
   - [Branch](#branch)
   - [Department](#department)
   - [Designation](#designation)
   - [Dynamic Permission-Keyed RBAC (ADR-31)](#dynamic-permission-keyed-rbac-adr-31)
   - [PII Envelope Encryption (AES-256-GCM / DEK & KEK)](#pii-envelope-encryption-aes-256-gcm--dek--kek)
   - [Blind Index / SHA-256 HMAC Fingerprint](#blind-index--sha-256-hmac-fingerprint)
   - [DPDP Act 2023 & Consent Ledger](#dpdp-act-2023--consent-ledger)

---

## 1. Scheduling, Shifts & Roster Terminology

### Shift Template (`ShiftTemplate`)
A reusable blueprint defining the working hours, session structure, break intervals, and rules for a shift. Shift templates are tenant-scoped and branch-scoped master records from which daily dated shift instances are materialized.

### Shift Types: FIXED, SPLIT, OVERNIGHT, CONTINUOUS
- **`FIXED`**: A single continuous working block during standard daytime hours (e.g., 09:00 to 18:00).
- **`SPLIT`**: A multi-session shift containing two or more distinct working sessions separated by a non-working mid-shift gap (e.g., Morning 08:00–12:00 and Evening 16:00–20:00).
- **`OVERNIGHT`**: A shift where the end time crosses midnight into the next calendar day ($T_{end} < T_{start}$, e.g., 22:00 to 06:00 next day).
- **`CONTINUOUS`**: Extended continuous duty shifts spanning across multiple calendar days (>24h, 36h, or 48h), common in healthcare emergency wards and plant shutdown maintenance.

### Session (`SessionWindow` / `ShiftSession`)
The fundamental atomic scheduled working block within a shift. A standard `FIXED` shift contains exactly 1 session; a `SPLIT` shift contains 2 or more ordered sessions. Each session has an explicit scheduled start time ($T_{start}$), scheduled end time ($T_{end}$), ingestion window margins, and minimum presence threshold.

### Pre-Session Window (`pre_window_minutes` / $W_{pre}$)
The buffer duration in minutes *before* the scheduled session start time during which punches will be ingested and mapped to this session. Default is **60 minutes** (e.g., for a 09:00 start with $W_{pre}=60\text{m}$, punches from 08:00 are recognized).

### Post-Session Window (`post_window_minutes` / $W_{post}$)
The buffer duration in minutes *after* the scheduled session end time during which punches will be ingested and mapped to this session. Default is **120 minutes** (e.g., for an 18:00 end with $W_{post}=120\text{m}$, punches up to 20:00 are captured for this shift).

### Session Ingestion Window
The complete mathematical time interval within which raw punches are eligible for pairing into session $j$:
$$\text{Ingestion Window}_j = [T_{start, j} - W_{pre}, \; T_{end, j} + W_{post}]$$
Punches outside all session ingestion windows are preserved append-only in `raw_envelope` but are not paired into shift attendance.

### Mid-Session Gap / Split-Shift Gap (Confirmed N65)
The scheduled non-working interval between the end of one session and the start of the next session in a multi-session split shift:
$$\text{Gap}_j = [T_{end, j}, \; T_{start, j+1}]$$
- **APMS Invariant**: Mid-shift gaps are **strictly non-working time**. Employees have free exit/stay without penalty.
- **Worked Time Exclusion**: Gap duration is 100% excluded from worked hours, late calculation, and overtime denominators.
- **Pollution Defense**: Stray punches recorded inside the gap are ignored and cannot inflate worked hours or generate overtime.

### Intra-Session Break (`break_duration_minutes`)
An authorized rest/lunch interval *inside* a single continuous session (e.g., a 60-minute lunch break during a 09:00–18:00 session). The break duration is deducted from the raw punch interval when computing net worked minutes:
$$\text{Net Worked Minutes} = \max(0, \; (\text{PunchOut} - \text{PunchIn}) - \text{break\_duration\_minutes})$$

### Overnight Shift & Commencement Date Attribution (BR-ATT-03)
When a shift commences on date $D$ and finishes on date $D+1$ (e.g., 22:00 on March 31 to 06:00 on April 1):
- **Core Rule**: Attendance is attributed **100% to the commencement date $D$** (March 31).
- It is never split across two days and never awarded to date $D+1$. Punches on date $D+1$ prior to $T_{end} + W_{post}$ belong to date $D$'s dated shift instance.

### Continuous Multi-Day Duty Window (>24h / 36h / 48h)
Special continuous shift patterns for medical personnel or industrial emergency engineers where a single tour of duty spans 24, 36, or 48 continuous hours. Attributed to the shift start calendar date $D$ (BR-ATT-15).

### Post-Duty Rest (`POST_DUTY_REST`)
The mandatory statutory rest period following a continuous multi-day duty shift. Calendar dates $D+1$ and $D+2$ covered by post-duty rest receive full attendance credit (1.0) without requiring physical punches.

### Roster Pattern (`RosterPattern`)
A cyclical sequence of shifts assigned to an employee or department (e.g., 6 Days General Shift $\rightarrow$ 1 Day Off; or 7 Days Morning $\rightarrow$ 1 Off $\rightarrow$ 7 Days Night $\rightarrow$ 2 Off).

### Forward Materialization
The automated background process that expands abstract recurring roster patterns into concrete daily records (`DatedShiftInstance`) for a rolling **30-day forward window**. Materialization ensures attendance pairing evaluates against immutable database rows.

### Dated Shift Instance (`DatedShiftInstance`)
The concrete, immutable scheduled record for a specific employee on a specific calendar date $D$. Stores the materialized session windows, rest day flags, and supervisor overrides.

### Rest Day / Weekly Off (`REST_DAY` / `WO`)
A calendar day designated as non-working under the employee's roster or statutory labor rules (e.g., Sunday). Recorded as `is_rest_day = True`. If an employee punches on a rest day, it qualifies for Comp-Off or Rest-Day Overtime.

### Ad-Hoc Schedule Override (Confirmed N67)
A same-day operational adjustment made by a supervisor to reassign an employee's shift for date $D$ (e.g., swapping Morning for Night shift to cover an emergency absence). Dual-path architecture: supervisor direct override or employee swap request via ESS. Immediately triggers re-pairing.

### Employer-Cancelled Session (`CANCELLED_PAID`, Confirmed N66d)
When management cancels a scheduled shift session due to power outage, emergency shutdown, or client cancellation (`ROS-10`). Salaried employees receive full attendance credit (1.0) as `CANCELLED_PAID`.

---

## 2. Punches, Hardware & Ingestion Terminology

### Raw Envelope (`raw_envelope`)
The immutable, append-only intake table where every incoming payload from devices, mobile apps, or CSV imports is preserved exactly as received.
- **Key Columns**: `id`, `tenant_id`, `source`, `device_identifier`, `raw_payload` (JSONB), `payload_hash` (SHA-256), `received_at`.
- **Constraint**: Updates and deletions are prohibited at database level.

### Punch Event (`punch_event`)
The normalized, canonical time event derived from a raw envelope. Represents a single timestamped presence record for an employee.
- **Key Columns**: `id`, `tenant_id`, `raw_envelope_id`, `employee_id`, `punch_time` (UTC), `punch_direction` (`IN`, `OUT`, `UNKNOWN`), `status` (`ACTIVE`, `DUPLICATE_IGNORED`).

### Canonical Punch (`CanonicalPunch`)
The internal standardized data transfer object (DTO) produced by device adapters before database persistence. Contains normalized employee code, UTC punch time, source, device ID, and optional location coordinates.

### Device Adapter & SPI (Service Provider Interface)
The modular translation layer that ingests vendor-specific protocols (e.g., ZKTeco ADMS, eSSL Push, eTimeOffice SOAP/JSON, CSV bulk files) and normalizes them into `CanonicalPunch` records.
- **Invariant**: Adapters never contain attendance math or payroll logic; attendance processor never speaks vendor SDK protocols.

### Device Identifier (`device_identifier`)
The serial number, MAC address, or assigned terminal code (e.g., `GATE_1_BIOMETRIC`, `PUNE_FACTORY_TURNSTILE`) identifying the physical hardware that captured a punch.

### Debounce Window & Deduplication (BR-PCH-01)
The time interval (default: **60 seconds**) during which subsequent punches for the same employee are treated as duplicate taps. Prevents multiple records caused by workers double-tapping biometric sensors.
- $t=0\text{s} \rightarrow \text{ACTIVE}$
- $t \le 60\text{s} \rightarrow \text{DUPLICATE_IGNORED}$
- $t > 60\text{s} \rightarrow \text{ACTIVE}$
- **Cross-Device Rule**: Debounce applies across *different* devices at the same branch.

### Duplicate Ignored (`DUPLICATE_IGNORED`)
Status assigned to a punch event that occurred within the 60-second debounce window of an earlier active punch. Persisted for auditability but completely bypassed by the attendance pairing engine.

### Active Punch (`ACTIVE`)
Status assigned to a valid, debounced punch event eligible for chronological shift pairing.

### Clock Drift Warning (`CLOCK_DRIFT_WARNING`)
A metadata flag assigned to a punch when the device's internal hardware clock deviates by more than **300 seconds (5 minutes)** from the server's NTP time (`received_at`). Alerts administrators to resynchronize device clocks.

### Out-of-Order (OOO) Reprocessing
When an offline biometric device reconnects after days and uploads historical backlog punches, APMS ingests the punches append-only and automatically schedules an asynchronous re-calculation job for affected calendar dates.

### Edge-Only Biometric Templates (BR-BIO-01)
Raw facial coordinate vectors or fingerprint minutiae templates.
- **APMS Invariant**: Raw templates are stored **exclusively on edge hardware** or local kiosks. APMS cloud databases **never** store raw biometric templates, complying with DPDP Act 2023.

---

## 3. Attendance Processing & Daily Rollup Terminology

### Chronological Pairing (BR-ATT-01)
The deterministic algorithm that sorts all `ACTIVE` punches within a session's ingestion window chronologically:
- **Session IN**: Earliest punch in the window.
- **Session OUT**: Latest punch in the window.
- If only 1 punch exists, it triggers a `LONE_PUNCH_ANOMALY`.

### Session Pairing Result (`SessionPairingResult`)
The intermediate calculation structure containing the matched IN/OUT timestamps, worked minutes, late minutes, early exit minutes, and session eligibility status (`COMPLETED` or `BELOW_MIN`) for a single session.

### Daily Pairing Result (`DailyPairingResult`)
The aggregated daily container combining results from all ordered sessions of a shift, including total scheduled minutes, total worked minutes, excluded mid-gap minutes, and single-punch flags.

### Daily Rollup Decision (`DailyRollupDecision`)
The final decision generated by the attendance engine detailing assigned status (`PRESENT`, `HALF_DAY`, `ABSENT`, `NEEDS_REVIEW`), worked ratio, overtime minutes, and plain-language explanation.

### Duration Ratio Mode (`DURATION_RATIO`, Confirmed N66a)
The system default daily rollup evaluation mode in APMS. Evaluates daily attendance by computing the ratio of total net worked minutes against total scheduled minutes.

### Worked Ratio ($R$)
The mathematical fraction of the shift worked by an employee:
$$R = \frac{\sum_{j=1}^k \text{WorkedDuration}_j}{\sum_{j=1}^k \text{ScheduledDuration}_j}$$

### Policy Threshold Bands ($\theta_{present}, \theta_{half\_day}$)
Configurable tenant policy thresholds defining status boundaries:
- **$\theta_{present}$ (Default: `0.90` / 90%)**: If $R \ge 0.90 \rightarrow \text{PRESENT}$ (1.0 day credit).
- **$\theta_{half\_day}$ (Default: `0.50` / 50%)**: If $0.50 \le R < 0.90 \rightarrow \text{HALF_DAY}$ (0.5 day credit).
- **Below $\theta_{half\_day}$ ($R < 0.50$)**: Status $\rightarrow \text{ABSENT}$ (0.0 credit).

### Daily Attendance Statuses: PRESENT, HALF_DAY, ABSENT, NEEDS_REVIEW, REST_DAY
- **`PRESENT`**: Full day attendance credit (1.0).
- **`HALF_DAY`**: Half day attendance credit (0.5); remaining 0.5 is unpaid LOP unless covered by half-day leave.
- **`ABSENT`**: Zero attendance credit (0.0); results in Loss of Pay deduction.
- **`NEEDS_REVIEW`**: Ambiguous state (e.g., lone punch) requiring human intervention before payroll lock.
- **`REST_DAY`**: Scheduled weekly off or holiday.

### Session Minimum-Presence Threshold ($\mu_j$, Confirmed N66b)
The minimum presence fraction required within an individual session (default: **$\mu_j = 0.50$** or 50% of session scheduled duration).

### Session Eligibility: COMPLETED vs BELOW_MIN
- **`COMPLETED`**: Worked duration in session $j$ meets or exceeds $\mu_j \times \text{ScheduledDuration}_j$.
- **`BELOW_MIN`**: Employee worked less than the required minimum presence for that session.

### Split-Shift Status Cap (Confirmed N66b)
In a multi-session split shift (e.g., 2 sessions), if an employee is absent or `BELOW_MIN` for one entire session, the daily status is **strictly capped at `HALF_DAY`**, even if total worked hours across the day exceed the 90% aggregate threshold.

### Lone-Punch Anomaly (`LONE_PUNCH_ANOMALY`, Confirmed Q4)
Occurs when an employee has only a single punch (either IN without OUT, or OUT without IN) for a scheduled shift:
- **Default Status**: Evaluates strictly to **`NEEDS_REVIEW`**.
- **Overtime Guarantee**: A lone punch is guaranteed to award **`overtime_minutes = 0`**.
- **Fallback Rule**: If unregularized at payroll cut-off, tenant policy dictates fallback (`HALF_DAY` deduction or `ABSENT` with LOP).

### Overtime (OT / `overtime_minutes`)
Worked duration performed beyond scheduled shift hours:
$$\text{Overtime Minutes} = \max(0, \; \text{Total Worked Minutes} - \text{Total Scheduled Minutes})$$
Requires explicit supervisor authorization under `BR-OTC-01` before payroll payout.

### Unauthorized Extra Time (`UNAUTHORIZED_EXTRA_TIME`, Confirmed N20)
Extra minutes worked beyond scheduled shift hours that have not received supervisor approval. Tracked for audit and productivity analysis but excluded from payable payroll wage lines.

### Late Arrival (`late_minutes`)
Minutes elapsed between scheduled session start time ($T_{start}$) and actual first punch ($P_{in}$):
$$\text{Late Minutes} = \max(0, \; P_{in} - T_{start})$$

### Early Departure / Early Exit (`early_departure_minutes` / `early_exit_minutes`)
Minutes elapsed between actual last punch ($P_{out}$) and scheduled session end time ($T_{end}$):
$$\text{Early Exit Minutes} = \max(0, \; T_{end} - P_{out})$$

### Attendance Regularization (`ATT-10`)
An ESS workflow allowing an employee to request correction of an attendance anomaly (e.g., forgotten punch, on-duty client visit). Upon supervisor approval, creates an administrative punch record and recalculates attendance.

### Muster Roll / Form II Register
The statutory monthly attendance ledger required under Indian labor law (Factories Act Form 25, OSH Code Form II). Details daily attendance status, worked hours, and OT for every employee across the month.

### Immutable Explanation Trace (`AttendanceExplanationTrace`)
A versioned JSON document permanently linked to each daily attendance record detailing rule inputs, policy bands, session windows, pairing timestamps, and mathematical justifications (Invariant 4).

---

## 4. Leave & Holiday Management Terminology

### Double-Entry Leave Ledger (`leave_transactions`)
The transactional accounting model for employee leave balances. Leave balances are never stored as mutable scalar numbers.
$$\text{Current Balance} = \sum (\text{Accruals} + \text{Credits}) - \sum (\text{Debits} + \text{Lapses})$$

### Leave Types (CL, SL, PL/EL, ML, Comp-Off)
- **Casual Leave (CL)**: Short-notice leave for unforeseen personal matters.
- **Sick Leave (SL)**: Medical leave for illness (may require medical certificate for $>2$ days).
- **Privilege / Earned Leave (PL / EL)**: Statutory accrued leave based on days worked (Factories Act: 1 day per 20 worked days).
- **Maternity Leave (ML)**: Statutory 26-week paid leave under the Maternity Benefit Act, 1961.
- **Comp-Off**: Earned time-off granted in lieu of working on a rest day or national holiday.

### Session-Targeted Half-Day Leave (Confirmed N66c)
Half-day leave applied on a multi-session day that targets a specific session (`First Half` $\rightarrow \text{Session}_1$, `Second Half` $\rightarrow \text{Session}_2$). The targeted session is waived with 0.5 leave credit, while the other session is worked.

### Sandwich Rule (BR-LVE-02)
A statutory/organizational leave policy where intervening Weekly Offs (WO) or Holidays (HOL) are converted to Leave or Loss of Pay if an employee is absent on both the preceding workday AND the following workday.

### Loss of Pay (LOP)
Unpaid absence days deducted from monthly salary when an employee is `ABSENT` without approved leave or has exhausted their leave balances.

### Negative Balance Lock (`allow_negative_balance`)
A policy control preventing leave balance from dropping below zero unless advance leave is explicitly configured for that leave category. Uncredited days automatically convert to LOP.

### Compensatory Off (Comp-Off)
Credit granted when an employee works on a scheduled weekly off or national holiday. Can be redeemed as paid leave within a configurable validity window (e.g., 60 days).

---

## 5. Statutory & Indian Payroll Terminology

### 10-Step Payroll Wizard
The sequential processing pipeline in Module M14:
1. Lock Attendance Summaries
2. Compute Payable Days & LOP
3. Calculate Gross Salary Components
4. Process Overtime & Allowances
5. Compute Statutory Deductions (EPF, ESI, PT)
6. Calculate TDS Income Tax (Sec 192)
7. Process Other Deductions / Advances
8. Compute Net Pay & Rounding
9. Audit Review & Discrepancy Checks
10. Final Period Lock & Payslip Generation

### Pay Run (`pay_run`)
A discrete monthly payroll processing instance for a pay group or tenant. Progresses through lifecycle states: `DRAFT` $\rightarrow$ `COMPUTED` $\rightarrow$ `REVIEWED` $\rightarrow$ `LOCKED` $\rightarrow$ `DISBURSED`.

### Period Lock & Next-Cycle Arrears Routing (BR-PAY-12)
Once a pay run is marked `LOCKED`, all records become permanently immutable. Retroactive changes (e.g., backdated regularization or salary increment) cannot touch historical runs; they are routed as **Arrears Adjustments** in the next open pay cycle.

### EPF (Employees' Provident Fund)
Statutory retirement benefit under the EPF & MP Act, 1952.
- **Mandatory Ceiling**: ₹15,000/month basic wage ceiling.
- **Employee Contribution**: 12% of PF Gross.
- **Employer Contribution**: 3.67% to EPF Account 1 + 8.33% to EPS.

### EPS (Employees' Pension Scheme)
Component of employer's PF contribution (8.33%) diverted to the pension fund, capped at ₹1,250/month (8.33% of ₹15,000 ceiling).

### EDLI (Employees' Deposit Linked Insurance)
Life insurance benefit funded entirely by employer (0.50% of PF Gross, capped at ₹75/month).

### ESI (Employees' State Insurance)
Social security healthcare scheme under the ESI Act, 1948.
- **Applicability Wage Ceiling**: ₹21,000/month earned gross wage.
- **Employee Contribution**: 0.75% of Gross Wages.
- **Employer Contribution**: 3.25% of Gross Wages.

### PT (Professional Tax)
State-level direct tax levied on salaried employees. Varies by state (e.g., Maharashtra: ₹200/month for March–January, ₹300 in February, subject to the constitutional annual ceiling of ₹2,500).

### TDS (Tax Deducted at Source, Section 192 & Section 115BAC)
Monthly income tax withheld from employee salary. System calculates annualized projected income under the default New Tax Regime (Section 115BAC) unless the employee formally elects the Old Tax Regime with verified exemptions (Section 80C, 80D, HRA).

### LWF (Labour Welfare Fund)
Statutory state welfare fund contribution (employee + employer share) deducted periodically (monthly, half-yearly, or annually depending on state regulations).

### OSH Code (Occupational Safety, Health and Working Conditions Code)
The consolidated Indian labor code governing working hours, overtime, and conditions. Sets the statutory baseline overtime rate at **2.0× standard hourly wage**.

### Fixed Gross vs Earned Gross
- **Fixed Gross**: The contractual monthly salary package agreed in the appointment letter (CTC component).
- **Earned Gross**: The actual salary earned in a pay period, pro-rated for payable days and LOP deductions.

### Daily Wage Rate Divisor
The formula used to calculate single-day salary for LOP or overtime calculations:
- **Calendar Days**: $\text{Fixed Gross} / \text{Days in Month}$ (28, 29, 30, or 31).
- **Fixed Divisor**: $\text{Fixed Gross} / 26$ or $\text{Fixed Gross} / 30$ (statutory standard in many industrial awards).

### Payslip Snapshot
An immutable JSON document storing the exact line-item breakdown of earnings, deductions, payable days, and statutory numbers for each employee in a locked pay run.

---

## 6. Organization, Security & Platform Terminology

### Multi-Tenancy & Tenant Isolation
APMS hosts multiple business organizations on a shared infrastructure with strict logical isolation. Every database table contains a `tenant_id` column.

### Row-Level Security (RLS) & `app.current_tenant_id`
PostgreSQL database engine feature enforcing multi-tenant isolation at the kernel level.
- Every session sets `SET LOCAL app.current_tenant_id = '<uuid>'`.
- Postgres policies reject any query attempting to view or modify rows belonging to another tenant, even if SQL omits the tenant filter.

### Composite Foreign Key `(tenant_id, foreign_id)`
APMS database constraint standard. Every foreign key references both `tenant_id` and the target primary key:
```sql
CONSTRAINT fk_employee_branch FOREIGN KEY (tenant_id, branch_id)
REFERENCES branches (tenant_id, id)
```
Guarantees that a record in Tenant A can never reference an entity (branch, department, designation) belonging to Tenant B.

### Organization / Legal Entity
The root corporate entity in APMS representing a registered company (e.g., "Acme Manufacturing Pvt Ltd").

### Branch
A distinct physical establishment, factory plant, hospital facility, or office site operated by an organization. Punches and biometric hardware are assigned to branches.

### Department
An operational division within a branch (e.g., "Assembly Line 1", "Cardiology", "Quality Assurance"). Supports hierarchical parent-child departmental trees.

### Designation
A job title or organizational role scoped to a department (e.g., "Senior CNC Operator", "Staff Nurse"). Defines hierarchy and grade levels.

### Dynamic Permission-Keyed RBAC (ADR-31)
Role-Based Access Control architecture where roles are dynamic bundles of explicit string permission keys (`perm_key`, e.g., `org:branch:create`, `emp:read`, `att:regularize`). Tenants can define custom roles by bundling permission keys.

### PII Envelope Encryption (AES-256-GCM / DEK & KEK)
Security architecture protecting sensitive Personally Identifiable Information (PAN, Aadhaar, Bank Account):
- Data Encryption Key (DEK): Unique key generated per employee/tenant.
- Key Encryption Key (KEK): Master root key managed in a hardware security module or KMS.
- Payload is encrypted with AES-256-GCM authenticated encryption.

### Blind Index / SHA-256 HMAC Fingerprint
A deterministic cryptographic hash of a PII identifier (e.g., `HMAC_SHA256(pan, tenant_secret)`). Allows exact-match searching and uniqueness enforcement on encrypted fields without decrypting the entire database.

### DPDP Act 2023 & Consent Ledger
Digital Personal Data Protection Act, 2023 (India). APMS enforces explicit employee consent notice before biometric capture, provides non-biometric alternative paths (RFID / Mobile PIN), and records all consent grants/withdrawals in an immutable audit ledger.

---

*End of Glossary. Maintained under APMS Documentation Standards (`docs/engineering/DEVELOPMENT_PLAN.md`).*
