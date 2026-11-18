---
name: leave-management
description: Analyzes, designs, implements, and tests APMS leave ledger management, accruals, sandwich rule engine, holiday calendars, and session-targeted leaves.
---

# APMS Leave Management Skill

## 1. Purpose
Guides agents in developing and verifying the Leave & Holiday Engine (`M6`), covering double-entry balance ledgers, session-targeted half-day leave mapping, sandwich rule evaluation, and holiday calendar configurations.

## 2. When to Activate
- When working on leave ledger models, accruals, or leave requests.
- When implementing session-targeted half-day leave (`N66c`).
- When implementing or testing the sandwich rule engine (`BR-LVE-02`).
- When implementing WFH quota auto-approvals (`Q6`).

## 3. Required Documents to Read
- `CONTEXT.md §4 (M11) + docs/product/SRS.md §4.4` — Leave module specification.
- `docs/requirements/BUSINESS_RULES.md#5-leave--holiday-rules-br-lve-br-hol` — Leave business rules.
- `docs/requirements/BUSINESS_RULES.md#br-rol-04-session-targeted-half-day-leave-mapping-confirmed-n66c` — N66c rules.

## 4. Relevant Requirement IDs
- `LVE-01` to `LVE-06`, `HOL-01`, `N66c`, `Q6`.

## 5. Domain-Specific Constraints
- **Double-Entry Ledger (ADR-08)**: Balances must never be stored as mutable scalars. Every credit and debit is an immutable row in `leave_transactions`.
- **Negative Balance Guard**: Prevent debit transactions if resulting balance $< 0$, unless policy explicitly sets `allow_negative_balance = true`.
- **Session-Targeted Half-Day**: Half-day leaves must target `FIRST_HALF` or `SECOND_HALF` explicitly (`N66c`).

## 6. Step-by-Step Implementation Workflow
1. **Model Ledger**: Implement `leave_transactions` table with `days`, `transaction_type`, and `running_balance`.
2. **Implement Balance Resolver**: Build service function summing transaction entries for a given employee and leave type.
3. **Implement Accrual Job**: Create monthly/annual background job generating `ACCRUAL` credit rows.
4. **Implement Session-Targeted Half-Day Leave (`N66c`)**: When a half-day leave request is approved, debit 0.5 days and tag the targeted session index.
5. **Implement Sandwich Engine (`BR-LVE-02`)**: Evaluate whether workdays flanking weekly offs or holidays are unapproved absences. If so, create debit transactions or tag LOP.
6. **Implement WFH Quota Check (`Q6`)**: Validate monthly usage against configured quota for auto-approval.

## 7. Validation Checklist
- [ ] Are leave balances strictly derived from ledger transaction sums?
- [ ] Does a half-day leave on a multi-session day correctly credit the targeted session and leave the other session to be worked?
- [ ] Does the sandwich engine correctly convert intervening holidays to leave or LOP when conditions are met?

## 8. Common Mistakes to Avoid
- Storing a mutable `current_balance` column on the employee table.
- Blindly deducting a full day's leave when an employee only requested a half-day.

## 9. Expected Output
Robust double-entry leave transaction service, sandwich policy evaluator, and pytest test suite verifying ledger balance math.

