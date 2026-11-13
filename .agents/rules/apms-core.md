---
trigger: always_on
description: Core APMS business, domain, and development invariants that must never be violated.
---

# APMS Core Business Invariants

## Invariants
1. **Raw Punch Immutability**: All incoming device, mobile, or import punches must be stored append-only in `raw_envelope`. Normalization into `punch_event` must preserve the raw payload without modification. Deletions and in-place updates are prohibited.
2. **Attendance Decoupled from Payroll**: The attendance calculation engine evaluates worked duration, session completeness, and assigns status (`PRESENT`, `HALF_DAY`, `ABSENT`). Payroll reads finalized attendance summaries as inputs; attendance never calculates wages, and payroll never mutates punches.
3. **Double-Entry Leave Ledger**: Leave balances are never stored as mutable scalar numbers. Every balance mutation is an append-only transaction in `leave_transactions`.
4. **Multi-Session Gap Exclusion (Confirmed N65)**: Intervals between scheduled sessions (e.g. 12:00 to 16:00 in split shifts) are strictly non-working time, excluded from worked duration and overtime calculations. Boundary punches are mandatory.
5. **Deterministic Audit Traceability**: Every daily attendance rollup and payroll pay run must persist an immutable JSON explanation trace detailing rule inputs, policy bands, and intermediate calculations.
6. **Statutory Parameterization**: EPF wage ceilings, ESI thresholds, and PT slabs must reside in versioned database tables, never hardcoded in source code.
7. **Traceability Tagging**: All domain logic and business rule implementations must cite their authoritative requirement IDs (`ATT-*`, `PAY-*`, `LVE-*`, `SHF-*`, `BR-*`).

