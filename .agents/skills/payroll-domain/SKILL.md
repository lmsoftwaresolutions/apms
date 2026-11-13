---
name: payroll-domain
description: Analyzes, designs, implements, and tests APMS payroll calculation logic, including the 10-step wizard, Indian statutory compliance (EPF, ESI, PT, TDS), and payslip snapshots.
---

# APMS Payroll Domain Skill

## 1. Purpose
Provides authoritative guidance for developing and testing the payroll calculation engine, Indian statutory deduction compliance, pay run reconciliation, and immutable payslip snapshot generation.

## 2. When to Activate
- When working on the payroll engine (`M7`), salary structures, or pay runs.
- When implementing statutory deduction calculators (EPF, ESI, PT, TDS, LWF).
- When writing tests for salary components, LOP deductions, or payslip PDF generation.

## 3. Required Documents to Read
- `docs/modules/payroll/SPEC.md` — Payroll module specification and 10-step wizard.
- `docs/requirements/BUSINESS_RULES.md#6-statutory-payroll-rules-br-pay-br-sta` — Statutory rules.
- `docs/requirements/REQUIREMENTS_CATALOG.md` — `PAY-*`, `STA-*`, `PSL-*` requirements.

## 4. Relevant Requirement IDs
- `PAY-01` to `PAY-05`, `STA-01` to `STA-05`, `PSL-01` to `PSL-03`, `N20` (Overtime authorization).

## 5. Domain-Specific Constraints
- **Paisa-Level Precision**: All currency math must use Python `Decimal` or integer paisa to eliminate floating-point rounding errors.
- **Statutory Caps in Database**: Statutory limits (EPF ₹15,000, ESI ₹21,000) must be loaded from effective-dated configuration tables.
- **Attendance is Read-Only**: The payroll engine consumes finalized attendance records and leave ledger totals. It must never update attendance tables.
- **Immutable Snapshots**: Locked pay runs must persist complete JSON snapshots in `pay_run_employee_snapshots`.

## 6. Step-by-Step Implementation Workflow
1. **Reconciliation Check**: Run Step 1 validation ensuring all attendance records in the pay period are finalized.
2. **Compute Base & Allowances**: Apply salary structure components, pro-rating for join dates and Loss of Pay (LOP) days.
3. **Incorporate Approved Overtime**: Pull only authorized overtime hours (`N20`). Multiply by configured rate multipliers.
4. **Execute EPF Engine (`STA-01`)**:
   - Determine PF Gross ($\text{Basic} + \text{DA}$).
   - Calculate Employee PF ($12\%$ capped at ₹15,000 unless higher opt-in).
   - Calculate Employer EPS ($8.33\%$ capped at ₹1,250) and Employer EPF ($12\% - \text{EPS}$).
5. **Execute ESI Engine (`STA-02`)**:
   - Check if gross wages $\le ₹21,000$. If eligible, deduct Employee $0.75\%$ and Employer $3.25\%$.
6. **Execute PT Engine (`STA-03`)**: Look up state slab table. Check if February adjustment applies.
7. **Execute TDS Engine (`STA-04`)**: Project annual taxable income under Section 115BAC (default) or Old Regime.
8. **Generate Snapshot & Disbursement**: Lock pay run, generate immutable snapshot JSON, export bank file, render PDF payslips.

## 7. Validation Checklist
- [ ] Do EPF/EPS contributions exactly match statutory rounding rules?
- [ ] Does ESI coverage persist through the end of contribution period even if wages cross ₹21,000 mid-period?
- [ ] Does February Professional Tax correctly apply state annual adjustment rules?
- [ ] Are locked pay runs completely immutable?

## 8. Common Mistakes to Avoid
- Using Python `float` for monetary calculations.
- Hardcoding statutory percentages or ceilings in code.
- Crediting unapproved overtime hours into payable earnings.

## 9. Expected Output
Compliant, fully tested payroll service code and golden unit test fixtures with zero paisa variance (±₹0.00).

