# Module Specification: Leave & Holiday Management (M6)

## 1. Module Overview & Scope

The Leave & Holiday Management Engine governs employee time-off, statutory leave entitlements, branch holiday calendars, weekly-off rules, and complex attendance policy interactions such as the **Sandwich Rule**.

All balance mutations are tracked through an **append-only double-entry transaction ledger** (`leave_transactions`), ensuring complete financial-grade auditability.

---

## 2. Applicable Requirements & Decisions

- **Requirements**: `LVE-01` through `LVE-06`, `HOL-01`.
- **Decisions**:
  - `ADR-08`: Double-entry leave ledger.
  - `N66c`: Session-targeted half-day leave mapping (`BR-ROL-04`).
  - `Q6`: Work-From-Home (WFH) auto-approval within monthly quota (`BR-WFH-01`).
  - `BR-LVE-02`: Sandwich rule evaluation engine.
  - `BR-LVE-03`: Negative balance locking mechanism.

---

## 3. Double-Entry Leave Ledger Architecture

Leave balances are never stored as mutable numbers in an employee record. Every credit (accrual, manual adjustment) and debit (leave taken, encashment, lapse) is an immutable row:

```sql
SELECT 
    leave_type_id,
    SUM(days) AS current_balance
FROM leave_transactions
WHERE tenant_id = :tenant_id 
  AND employee_id = :employee_id
GROUP BY leave_type_id;
```

### Transaction Types:
- `ACCRUAL`: Periodic monthly/annual credit.
- `APPLICATION`: Debit from approved leave request.
- `CANCELLATION`: Credit reversal when approved leave is cancelled.
- `ENCASHMENT`: Debit converted to cash payout during payroll.
- `LAPSE`: Annual expiration of non-carry-forward balances.

---

## 4. Key Policy Engines

### 4.1 Session-Targeted Half-Day Leave (`N66c`)
- Half-day leave applications require specifying `session_target`: `FIRST_HALF` or `SECOND_HALF`.
- On a multi-session day:
  - The targeted session is credited with 0.5 leave days.
  - The non-targeted session must be worked. If worked successfully, daily status becomes `PRESENT` with 0.5 worked credit and 0.5 leave credit.

### 4.2 Sandwich Rule Engine (`BR-LVE-02`)
- The sandwich rule is evaluated during the monthly payroll pre-run reconciliation:
  ```text
  If [Workday before WO/HOL == ABSENT or UNAPPROVED_LEAVE] 
  AND [Workday after WO/HOL == ABSENT or UNAPPROVED_LEAVE]
  THEN:
      Convert intervening WO/HOL days to LEAVE (or LOSS_OF_PAY).
  ```

### 4.3 WFH Quota Auto-Approval (`Q6`)
- WFH is configured as an attendance category with a monthly quota (e.g. 4 days).
- Upon submission:
  - System counts approved WFH days in current calendar month.
  - If $\text{Count} < \text{Quota}$, request is immediately transitioned to `AUTO_APPROVED` and published to attendance calendar without manager intervention.

