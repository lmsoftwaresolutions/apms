# APMS Quality Assurance & Testing Strategy

## 1. Testing Philosophy & Verification Pyramid

Because APMS processes real employee salaries, statutory tax liabilities, and legally mandated muster rolls, software defects have direct financial, regulatory, and legal ramifications. Quality assurance is treated as a first-class engineering discipline.

```text
               / \
              / E2E \             <- End-to-End API Workflows (< 5%)
             /-------\
            / Shadow  \           <- Legacy Shadow-Run Diff Tests (10%)
           /-----------\
          / Golden Sets \         <- CA-Verified Golden Pay Runs & Punches (15%)
         /---------------\
        / Integration/RLS \       <- PostgreSQL RLS Cross-Tenant Leak Tests (30%)
       /-------------------\
      /     Unit Tests      \     <- Pure Domain Math & Policy Bands (40%)
     /-----------------------\
```

---

## 2. Test Suites & Categorization

### 2.1 Unit Tests (Pure Domain Engines)
- **Scope**: Mathematical formulas, policy band mappings, statutory formulas, sandwich rule evaluations, punch pairing algorithms.
- **Requirements**: Fast, in-memory, zero database dependencies, 100% deterministic.
- **Coverage**: 100% branch coverage required for:
  - `BR-ROL-01` to `BR-ROL-06` (Attendance daily rollup, session qualification, cancelled sessions).
  - `BR-STA-01` to `BR-STA-04` (EPF, ESI, PT, TDS statutory calculators).
  - `BR-LVE-01` to `BR-LVE-03` (Leave ledger transactions and sandwich logic).

### 2.2 Integration & RLS Cross-Tenant Isolation Tests
- **Scope**: Database interactions, repository layers, and Row-Level Security policies.
- **Mandatory Isolation Assertion**:
  ```python
  async def test_tenant_rls_isolation(db_session, tenant_a_id, tenant_b_id):
      # Authenticate as Tenant A
      await set_tenant_context(db_session, tenant_a_id)
      
      # Attempt to select Tenant B employee by explicit ID
      stmt = select(Employee).where(Employee.tenant_id == tenant_b_id)
      result = (await db_session.execute(stmt)).scalars().all()
      
      # Must return ZERO rows; never raise an error that reveals entity existence
      assert len(result) == 0
  ```

### 2.3 Golden Test Suites
- Pre-compiled historical test fixtures verified by professional Chartered Accountants and HR operations veterans:
  - 10 multi-session punch scenarios (overnight, split shift, missing punch, excessive break).
  - 5 complete payroll pay runs across different Indian states (Maharashtra, Karnataka, Delhi, Tamil Nadu) testing EPF caps, ESI wage changes, and PT February adjustments.
  - Assertions check net pay and deductions down to the exact paisa (±₹0.00).

### 2.4 Shadow-Run Diff Testing
- Used when migrating existing organizations from legacy systems (e.g. legacy eTimeOffice / desktop payroll):
  - Ingest identical raw punches and shifts into both legacy and APMS.
  - Automatically diff daily attendance status and final gross/net pay.
  - Any variance > ₹0.00 or status mismatch generates an automated discrepancy report for investigation.

---

## 3. Test Coverage Thresholds

| Module / Layer | Minimum Line Coverage | Minimum Branch Coverage |
| :--- | :--- | :--- |
| **Statutory Payroll Engine (M7)** | 100% | 100% |
| **Attendance & Pairing Engine (M4, M5)** | 95% | 95% |
| **Leave Ledger Engine (M6)** | 95% | 95% |
| **Multi-Tenant RLS Policies (M1)** | 100% | 100% |
| **All Other Modules & APIs** | 85% | 80% |

