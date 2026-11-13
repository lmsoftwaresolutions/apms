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
  - It is flagged with anomaly code `SINGLE_PUNCH_ANOMALY`.
  - Resolution paths:
    1. Tenant Admin / HR creates a manual punch with reason code (`ATT-06`).
    2. Employee submits an Attendance Regularization request (`ATT-10`) via ESS, approved by Supervisor.
  - If unresolved at payroll cut-off, tenant policy dictates fallback: `HALF_DAY` deduction or `ABSENT` (Loss of Pay).

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
- All overtime hours require explicit manager/supervisor authorization before payroll credit.
- Unapproved extra hours are logged as `UNAUTHORIZED_EXTRA_TIME` and excluded from payroll calculations.

### BR-WFH-01: WFH Auto-Approval Quota (Confirmed Q6)
- Tenants can configure a monthly Work-From-Home (WFH) quota (e.g., 4 days per calendar month).
- WFH applications submitted within the remaining quota balance are **auto-approved immediately** by the system without blocking on manager review.
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

