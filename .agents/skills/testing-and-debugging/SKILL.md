---
name: testing-and-debugging
description: Executes comprehensive unit testing, RLS cross-tenant leak testing, golden test suites, and diagnostic debugging across APMS modules.
---

# APMS Testing & Debugging Skill

## 1. Purpose
Guides agents in creating, running, and diagnosing tests across all layers of the APMS test pyramid: unit tests, PostgreSQL RLS integration tests, golden test vectors, and shadow-run diff tests.

## 2. When to Activate
- When writing tests for new features or bug fixes.
- When validating statutory payroll calculations against chartered accountant benchmarks.
- When diagnosing attendance pairing anomalies, single punch edge cases, or test failures.
- When verifying test coverage against Definition of Done thresholds.

## 3. Required Documents to Read
- `CONTEXT.md §9 + docs/product/SRS.md §5–6` — Testing pyramid and coverage thresholds.
- `CONTEXT.md §9 MVP DoD + docs/product/SRS.md §6` — Quality gates and pull request checklists.
- `docs/requirements/BUSINESS_RULES.md` — Expected formulas and mathematical behaviors.

## 4. Relevant Requirement IDs
- `NFR-SEC-01`, `PLT-05`, `ATT-11`, `STA-01` to `STA-05`, `ADR-02`.

## 5. Domain-Specific Constraints
- **Zero Variance on Payroll**: Statutory deductions and net pay must match golden test fixtures down to the exact paisa (±₹0.00).
- **Mandatory Negative RLS Tests**: Every entity test suite must assert that cross-tenant queries return zero records.
- **Pure Unit Tests**: Unit tests for pairing and daily rollups must be pure, fast, and execute without live database connections.

## 6. Step-by-Step Testing Workflow
1. **Identify Test Target**: Determine whether the component is a pure domain formula (unit test) or involves persistence/RLS (integration test).
2. **Construct Test Vectors**: Define diverse input vectors, including boundary conditions (e.g. overnight shifts, single punch, mid-shift gaps, exact statutory wage ceilings).
3. **Execute Unit Tests**:
   ```powershell
   pytest tests/unit/test_attendance_engine.py -v
   ```
4. **Execute RLS Integration Tests**:
   ```powershell
   pytest tests/integration/test_rls_isolation.py -v
   ```
5. **Execute Golden Test Suites**:
   ```powershell
   pytest tests/golden/test_payroll_statutory_vectors.py -v
   ```
6. **Coverage Analysis**: Run pytest with coverage flags and verify thresholds ($100\%$ on statutory/RLS, $>95\%$ on attendance/leave).

## 7. Validation Checklist
- [ ] Do all tests pass deterministically without flaky timing issues?
- [ ] Are edge cases (unequal sessions, single punches, midnight crossovers) covered?
- [ ] Does the test suite assert negative cross-tenant access?
- [ ] Is test coverage above DoD thresholds?

## 8. Common Mistakes to Avoid
- Mocking out the database in RLS tests (RLS can only be verified against real PostgreSQL).
- Using floating-point comparisons for salary assertions (`assert a == b` instead of `Decimal` or rounded paisa).

## 9. Expected Output
A comprehensive pytest test file with deterministic assertions and coverage reporting.

