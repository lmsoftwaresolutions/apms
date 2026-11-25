# APMS Authoritative Business Rules

## 1. Governance & Precedence

This document serves as the **single source of truth** for all business logic, mathematical formulas, threshold algorithms, and policy evaluations across APMS. In the event of a discrepancy between general descriptions and this document, this document prevails.

---

## 2. Ingestion & Pairing Engine Rules (`BR-ING`, `BR-PCH`, `BR-ATT`)

### BR-ING-01: Immutable Raw Ingestion
- Every incoming punch from biometric hardware, mobile apps, or file imports must first be inserted into `raw_envelope`.
- Fields: `tenant_id`, `device_id`, `raw_payload`, `received_at`, `payload_hash`.
- Raw records are strictly append-only and cannot be updated or deleted by any application role.

### BR-PCH-01: Idempotency & Debounce Window
- Deduplication rule: Two punches for the same `employee_id` within `debounce_seconds` (default: 60s) from the same or different devices are evaluated.
- The first punch is retained as `ACTIVE`; subsequent punches within the debounce window are marked `DUPLICATE_IGNORED` and excluded from pairing.

### BR-ATT-01: Session-Aware Chronological Pairing
- Pairing is executed against scheduled sessions of the employee's `dated_shift_instance` for the day.
- A scheduled shift instance $S$ comprises $k$ ordered sessions: $S = \{ \text{Session}_1, \text{Session}_2, \dots, \text{Session}_k \}$.
- Each session $j$ defines:
  - $\text{Session Start Time} = T_{start, j}$
  - $\text{Session End Time} = T_{end, j}$
  - $\text{Ingestion Window} = [T_{start, j} - W_{pre}, T_{end, j} + W_{post}]$ (Default $W_{pre} = 60\text{ min}$, $W_{post} = 120\text{ min}$).
- Punches falling within session $j$'s ingestion window are paired chronologically:
  - First punch in window $\rightarrow \text{Session In}$.
  - Last punch in window $\rightarrow \text{Session Out}$.
  - Intermediate punches $\rightarrow$ evaluated against intra-session break thresholds or marked informational.
- `early_arrival_ignore_minutes` and `late_departure_ignore_minutes` apply only when calculating duration and overtime. They do not rewrite `punch_event.punch_time`, the session in punch, or the session out punch.
- A deviation of at most the ignore window is excluded from worked duration, so it does not become overtime. A larger deviation counts in full. The ignore minutes are not subtracted from that total.
- Worked examples for a 09:00–18:00 shift, `early_arrival_ignore_minutes = 10`, `late_departure_ignore_minutes = 30`, and an overtime minimum of 30 minutes:
  1. In at 08:50 and out at 18:30. Both deviations sit inside the windows. Duration is 09:00–18:00 (540 minutes) and overtime is 0. The stored punches remain 08:50 and 18:30.
  2. In at 08:20 and out at 18:00. The 40-minute early arrival is larger than 10, so all 40 minutes count. Overtime is 40. The in punch remains 08:20.
  3. In at 09:00 and out at 18:45. The 45-minute late stay is larger than 30, so all 45 minutes count. Overtime is 45. The out punch remains 18:45.
  4. In at 08:10 and out at 18:55. The arrival is 50 minutes early and the departure is 55 minutes late. Both are larger than their windows, so both count in full: 50 + 55 = 105 minutes of overtime. The punches remain 08:10 and 18:55.
- `FIRST_IN_LAST_OUT` subtracts the session's scheduled break once from the first-to-last span, because that span still contains the break.
- `ALL_IN_OUT` sums each in/out pair. Time between pairs is already excluded. The scheduled break is reduced by those punched gaps, and only the remainder is subtracted. A 09:00–13:00 and 14:00–18:00 day with a 60-minute scheduled break is 480 minutes. The same two punches at 09:00 and 18:00, with no punched gap, are 540 − 60 = 480 minutes.
- An odd trailing punch under `ALL_IN_OUT` leaves a pair open. The day is `NEEDS_REVIEW` with overtime 0, including when earlier pairs already cover a full day.

### BR-ATT-02: Mid-Shift Gap Handling (Confirmed N65)
- In multi-session shifts (e.g., Morning Session 08:00–12:00, Evening Session 16:00–20:00), the interval between sessions:
  $$\text{Gap}_j = [T_{end, j}, T_{start, j+1}]$$
- **Rule**:
  1. Mid-shift gaps are strictly **non-working intervals**.
  2. Employees have free exit/stay during the gap without penalty.
  3. Boundary punches are mandatory (Session $j$ Out and Session $j+1$ In).
  4. Gap duration is completely excluded from total worked hours and overtime denominators.
  5. Gap thresholds are never used to split or merge explicitly scheduled sessions. Intra-session break thresholds apply only within a single scheduled session.

### BR-ATT-03: Overnight Shift Attribution
- For shifts where $T_{end} < T_{start}$ (crosses midnight, e.g., 22:00 to 06:00 next day):
  - The shift is attributed to the **calendar date on which the shift commenced** ($D$).
  - Punches occurring on calendar date $D+1$ prior to $T_{end} + W_{post}$ belong to the dated shift instance of date $D$.

### BR-ATT-04: Single-Punch Anomaly Treatment (Confirmed Q4)
- When only a single punch exists for a scheduled session/day:
  - The attendance record defaults to status `NEEDS_REVIEW`.
  - It is flagged with anomaly code `LONE_PUNCH_ANOMALY`.
  - Resolution paths:
    1. Tenant Admin / HR creates a manual punch with reason code (`ATT-06`).
    2. Employee submits an Attendance Regularization request (`ATT-10`) via ESS, approved by Supervisor.
  - If unresolved at payroll cut-off, tenant policy dictates fallback: `HALF_DAY` deduction or `ABSENT` (Loss of Pay).

### BR-ATT-15: Continuous Multi-Day Duty Attribution (>24h / 36h / 48h)
- For continuous duty windows spanning across 2 or 3 calendar dates (e.g. 36h or 48h emergency medical calls):
  - The entire worked duration is attributed to the **shift start calendar date** ($D$).
  - Calendar dates $D+1$ and $D+2$ covered by the duty window or mandatory post-duty recovery rest are marked `POST_DUTY_REST` with full attendance credit (1.0).
  - Continuous duty exceeding 16 hours automatically qualifies for Long-Duty Allowance.

### BR-ATT-16: Lone-Punch Guardrails
- Under no circumstances may a lone punch calculate overtime or unearned full-day pay.
- If unregularized by period close, the record strictly defaults to the tenant's chosen fallback (Default: `ABSENT` with LOP).

### BR-ATT-17: Split WFH Cumulative Minute Accounting
- For telecommuting and work-from-home shifts, total daily credit is derived from the cumulative sum of verified active session minutes.
- Capped at the scheduled shift maximum unless pre-approved overtime exists.

### BR-ATT-18: Read-vs-Write Decoupling & Display Side-Effect Ban
- Accessing or rendering attendance views, muster rolls, or payroll previews must execute strictly in read-only mode (`SELECT`).
- No query or viewing operation may mutate persisted attendance records or explanation traces.

---

## 3. Daily Attendance Rollup & Qualification (`BR-ROL`)

### BR-ROL-01: Daily Rollup Mode (Confirmed N66a)
- APMS uses **`DURATION_RATIO`** as the system default daily rollup mode.
- Formula for Worked Ratio $R$:
  $$R = \frac{\sum_{j=1}^k \text{WorkedDuration}_j}{\sum_{j=1}^k \text{ScheduledDuration}_j}$$
- Where $\text{WorkedDuration}_j = \min(\text{SessionActualDuration}_j, \text{ScheduledDuration}_j + \text{PermittedEarlyArrival})$.

### BR-ROL-02: Status Mapping Bands (Confirmed N66a)
Tenant policy bands map ratio $R$ to daily attendance status:
- If $R \ge \theta_{present}$ (Default: 0.90 / 90%): Status = **`PRESENT`** (Attendance Credit = 1.0).
- If $\theta_{half\_day} \le R < \theta_{present}$ (Default: $0.50 \le R < 0.90$): Status = **`HALF_DAY`** (Attendance Credit = 0.5).
- If $R < \theta_{half\_day}$ (Default: $R < 0.50$): Status = **`ABSENT`** (Attendance Credit = 0.0).

### BR-ROL-03: Session Minimum-Presence Eligibility (Confirmed N66b)
- Each session $j$ defines a minimum presence threshold:
  $$\text{MinPresence}_j = \mu_j \times \text{ScheduledDuration}_j \quad (\text{Default } \mu_j = 0.50)$$
- **Eligibility Qualification**:
  - If $\text{WorkedDuration}_j \ge \text{MinPresence}_j$: $\text{SessionEligibility}_j = \text{COMPLETED}$.
  - If $\text{WorkedDuration}_j < \text{MinPresence}_j$: $\text{SessionEligibility}_j = \text{BELOW_MIN}$.
- **Status Cap Rule**: In a 2-session split shift, if an employee is completely absent or `BELOW_MIN` for one full session, daily attendance status is **capped at `HALF_DAY`**, even if total worked hours in the other session meet the aggregate `PRESENT` threshold.
- Actual worked duration is stored independently of eligibility for audit and explanation.

### BR-ROL-04: Session-Targeted Half-Day Leave Mapping (Confirmed N66c)
- When an employee applies for a half-day leave on a multi-session day:
  - The request explicitly targets a session: `First Half` $\rightarrow \text{Session}_1$, or `Second Half` $\rightarrow \text{Session}_2$.
  - The targeted session's attendance requirement is waived and covered by 0.5 leave credit.
  - The non-targeted session is evaluated strictly against its individual scheduled parameters.
  - Total Daily Credit = $\text{Leave Credit } (0.5) + \text{Worked Session Credit } (0.5 \text{ if COMPLETED}) = 1.0$.

### BR-ROL-05: Employer-Cancelled Sessions (Confirmed N66d)
- Under `ROS-10`, when management cancels a scheduled session (e.g., student excursion, power outage, emergency shutdown):
  - **Salaried Employees**: Cancelled session is marked `CANCELLED_PAID`. The employee receives full attendance credit for that session as if worked.
  - **Per-Session Employees (`PAY-14`)**: Tenant policy configurable:
    - *Option A*: Pay fixed cancellation retainer fee.
    - *Option B*: Exclude from payable count with no deduction penalty.

### BR-ROL-06: Ad-Hoc Same-Day Schedule Modifications (Confirmed N67)
- Dual-path architecture for same-day schedule changes:
  - **Path 1 (Supervisor Direct Override)**: Department Managers / Shift Supervisors can directly reassign an employee's shift instance for date $D$ without altering the master recurring rotation pattern.
  - **Path 2 (Employee Request)**: Employee submits a same-day shift change or swap request via ESS, which becomes effective only upon supervisor approval.
- Any modification immediately invalidates existing attendance pairings for date $D$ and enqueues an asynchronous re-calculation job.

---

## 4. Overtime & Work-From-Home Rules (`BR-OTC`, `BR-WFH`)

### BR-OTC-01: Overtime Authorization Requirement (Confirmed N20)
- Worked duration beyond scheduled shift hours does **NOT** automatically convert to payable overtime.
- All overtime hours require explicit manager/supervisor authorization before payroll credit, unless the admin has enabled overtime auto-approval on the policy.
- Unapproved extra hours are logged as `UNAUTHORIZED_EXTRA_TIME` and excluded from payroll calculations.
- The extra-hours rate is blank until an admin sets it. The system does not assume 1.5× or any other rate.
- An extra-hours amount greater than zero is the pay rate for that unit: per minute, per hour, or per day.
- When the amount is zero or omitted, a multiplier greater than zero is the rate instead. When both are omitted, extra hours are recorded and are not paid.
- `WFH_ONLY` auto-approves overtime only on a work-from-home day, and only when overtime auto-approval is enabled. `THRESHOLD_BASED` and `AUTO_APPROVE_BELOW_THRESHOLD` auto-approve only up to the threshold the admin entered. A blank threshold does not auto-approve.
- The daily overtime cap is `max_ot_minutes_per_day`. The quarterly cap is `quarterly_ot_cap_minutes`. Neither is filled in by the system. A blank cap is not enforced.
- Comp-off conversion uses `comp_off_minutes_per_day` from the shift policy. Conversion is refused until the admin sets that value.
- The work-from-home auto-approval quota is blank until the admin sets it. Auto-approval does not run without both the switch and a quota.

### BR-WFH-01: WFH Auto-Approval Quota (Confirmed Q6)
- Tenants configure a monthly Work-From-Home (WFH) quota on the shift policy. The quota is blank until the admin sets it, so a number such as 4 days is an example the admin may enter, not a system default.
- WFH applications submitted within the remaining quota balance are **auto-approved immediately** only when the admin has enabled work-from-home auto-approval. Until that switch is on, every request stays pending.
- WFH applications exceeding the monthly quota require explicit manager approval.

---

## 5. Leave & Holiday Rules (`BR-LVE`, `BR-HOL`)

### BR-LVE-01: Double-Entry Balance Tracking
- Leave balances are never stored as mutable scalar numbers.
- Every balance mutation is an append-only entry in `leave_transaction`:
  $$\text{Current Balance} = \sum (\text{Accruals} + \text{Credits}) - \sum (\text{Debits} + \text{Lapses})$$

### BR-LVE-02: Sandwich Rule Evaluation
- If enabled by tenant policy:
  - When an employee is absent or on unapproved leave on both the workday immediately preceding a Weekly Off (WO) / Holiday (HOL) AND the workday immediately following:
  - The intervening Weekly Off / Holiday is automatically converted to **Leave** (or Loss of Pay if no balance remains).

### BR-LVE-03: Negative Balance Lock
- The system strictly forbids leave deduction if $\text{Current Balance} - \text{Requested Days} < 0$, unless the leave type is explicitly configured with `allow_negative_balance = true` (advance leave).
- If insufficient balance exists, the uncredited days automatically transition to `LOSS_OF_PAY` (LOP).

---

## 6. Statutory Payroll Rules (`BR-PAY`, `BR-STA`)

### BR-PAY-01: Loss of Pay (LOP) Salary Deduction
- Daily wage rate for LOP calculation is governed by tenant pay group formula:
  $$\text{Daily Wage Rate} = \frac{\text{Monthly Fixed Gross}}{\text{Days in Month (or Configured Fixed 26/30)}}$$
- Total LOP Deduction = $\text{LOP Days} \times \text{Daily Wage Rate}$.

### BR-STA-01: Employees' Provident Fund (EPF - India)
- **Applicability**: Required for establishments with $\ge 20$ employees.
- **Wage Ceiling**: Standard statutory limit is ₹15,000/month (configurable via effective-dated statutory table).
- **PF Gross Wage**: $\text{Basic} + \text{DA} + \text{Retaining Allowance}$.
- **Employee Contribution**: 12% of $\min(\text{PF Gross}, ₹15,000)$ (or full PF Gross if voluntary higher PF opted).
- **Employer Contribution**:
  - Employee Pension Scheme (EPS): 8.33% capped at ₹15,000 wage (max ₹1,250/month).
  - Employer EPF: $12\% - \text{EPS Contribution}$ (balance to EPF A/c 1).
  - Admin Charges: 0.50% on total PF gross.
  - EDLI Contribution: 0.50% capped at ₹15,000 wage (max ₹75/month).

### BR-STA-02: Employees' State Insurance (ESI - India)
- **Applicability**: Required for covered units; applicable to employees whose gross wages do not exceed ₹21,000/month (₹25,000 for employees with disabilities).
- **ESI Gross**: Total earned gross salary excluding annual bonus.
- **Contributions**:
  - Employee Contribution: 0.75% of Gross Wages.
  - Employer Contribution: 3.25% of Gross Wages.
- **Wage Ceiling Rule**: If an employee's wages cross ₹21,000 mid-contribution period (April–Sept or Oct–March), ESI continues to be deducted until the end of that contribution period.

### BR-STA-03: Professional Tax (PT - India)
- State-specific monthly slab evaluation based on earned gross salary.
- Automated February adjustment (e.g., Maharashtra standard ₹200/month for March–January, and ₹300 in February to meet the annual ₹2,500 cap).

### BR-STA-04: TDS Income Tax (Section 192 - India)
- Calculates monthly tax deduction by projecting annualized estimated taxable income.
- Default tax regime: Section 115BAC (New Tax Regime) with statutory rebate under Section 87A (income up to ₹7,00,000 tax-free), unless employee formally submits an Old Regime declaration with verified exemptions (Section 80C, 80D, HRA Section 10(13A)).

### BR-PAY-12: Strict Period Lock & Next-Cycle Arrears Routing
- Once a pay run status is marked `LOCKED`:
  - Attendance summaries, leave transactions, and payslip line items for that pay period become permanently immutable.
  - Any backdated attendance regularizations, late punches, or retroactive pay increments generate an **Arrears Adjustment entry in the next open pay cycle**.
  - Historical closed pay runs are never modified.

---

## 7. Employee Lifecycle & Auto-Promotion Rules (`BR-LFC`)

### BR-LFC-01: Automated Status Progression
- Onboarding sets employee initial status (`Trainee`, `Probationary`, `Contract`) and defined target duration.
- System initiates confirmation reviews at T-30, T-15, and T-7 days before scheduled confirmation date.
- Upon supervisor approval (or tenant auto-confirm policy timeout), status moves automatically to `CONFIRMED`.

### BR-LFC-02: Probation End Date Extension on Unpaid Leave
- If configured by tenant policy, unpaid leave days (`LOSS_OF_PAY`) taken during probation automatically extend the probation end date by the exact count of LOP days:
  $$\text{Adjusted Probation End} = \text{Original Probation End} + \text{LOP Days}$$

### BR-LFC-03: Confirmation Impact on Leave & Notice
- Confirmation immediately triggers updated leave entitlement policies (e.g., unlocking annual earned leave accrual) and transitions the employee to standard full-time notice period bands.

---

## 8. Field Workforce Tracking & Privacy Rules (`BR-FLD`)

### BR-FLD-01: Tiered Geolocation Capture
- **Level 1 (Punch GPS)**: Coordinates are captured strictly at the instant of Clock-In / Clock-Out.
- **Level 2 (Geofenced Site Visits)**: Logs boundary arrival/departure events at predefined client or facility coordinates.
- **Level 3 (Visit Check-Ins)**: Check-in records time, location, notes, and photo proof-of-work.
- **Level 4 (Duty-Hours Route Tracking)**: Continuous periodic GPS coordinate logging active **strictly during scheduled shift hours**.

### BR-FLD-02: Omnipresent On-Duty Transparency Banner & Zero Off-Hours Tracking
- Level 4 tracking is impossible when off-duty or after Clock-Out.
- The mobile application displays an omnipresent persistent system notification whenever location tracking is active.

---

## 9. Hardware & Edge Biometrics Rules (`BR-BIO`, `BR-DEV`)

### BR-BIO-01: Infrastructure Cost Cap & Edge Matching
- Total hosting/infrastructure cost must remain $\le ₹80\text{ per employee/month}$.
- Facial recognition matching runs on the client device or local edge kiosk. Third-party cloud vision per-punch APIs are prohibited.
- Raw biometric templates must remain on edge hardware; never uploaded in plain-text to cloud databases.

### BR-DEV-01: Device Heartbeat & Clock Drift Enforcement
- Devices must send a heartbeat every 60 seconds.
- If hardware clock drifts $> 5\text{ minutes}$ from NTP, new punches are tagged `CLOCK_DRIFT_WARNING` and an alert is issued to the system administrator.

---

## 10. DPDP Act 2023 & Minor / Student Rules (`BR-PRV`)

### BR-PRV-03: Verifiable Parental Consent for Minors
- For students or employees under 18 years of age:
  - System requires digitally verifiable consent from a parent or legal guardian prior to collecting biometric or personal data.
  - Consent records are stored append-only with timestamp, parent identity token, and purpose specification.
