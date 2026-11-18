---
name: attendance-engine
description: Analyzes, designs, implements, and tests APMS attendance engine functionality, including session-aware punch pairing, daily rollup calculations, explanation traces, and anomaly handling.
---

# APMS Attendance Engine Skill

## 1. Purpose
Provides step-by-step guidance for implementing and verifying the core attendance calculation engine, covering punch pairing, mid-shift gap exclusions, daily rollup modes, session qualification, and audit traces.

## 2. When to Activate
- When working on punch pairing logic (`M4`) or daily rollup calculations (`M5`).
- When implementing or debugging `N65` (gap handling), `N66a` (`DURATION_RATIO` rollup), `N66b` (session min-presence), `N66c` (half-day leave), or `Q4` (single punch anomaly).
- When modifying attendance explanation trace generation.

## 3. Required Documents to Read
- `docs/modules/attendance/SPEC.md` — Complete attendance engine specification.
- `docs/requirements/BUSINESS_RULES.md#2-ingestion--pairing-engine-rules-br-ing-br-pch-br-att` — Pairing rules.
- `docs/requirements/BUSINESS_RULES.md#3-daily-attendance-rollup--qualification-br-rol` — Rollup rules.

## 4. Relevant Requirement IDs
- `ATT-01` through `ATT-18`, `PCH-01` through `PCH-06`, `N65`, `N66a`, `N66b`, `N66c`, `N66d`, `Q4`.

## 5. Domain-Specific Constraints
- **Session-Aware Ingestion Windows**: Never pair punches across a blind 24-hour window; always pair against the session ingestion window $[T_{start, j} - W_{pre}, T_{end, j} + W_{post}]$.
- **Mid-Shift Gap Exclusion**: Gaps between scheduled sessions are strictly non-working time (`BR-ATT-02`).
- **Explanation Trace Mandatory**: Every rollup calculation must generate and save an `attendance_explanation_traces` row.
- **Rollup Default**: Default rollup is `DURATION_RATIO`. In 2-session split shifts, a session `BELOW_MIN` caps status at `HALF_DAY`.
- **Single Punch Default**: Single punch defaults to `NEEDS_REVIEW` (`BR-ATT-04`).

## 6. Step-by-Step Implementation Workflow
1. **Fetch Shift & Punches**: Retrieve `DatedShiftInstance` and chronological normalized punches for the employee and date.
2. **Execute Session Pairing**: For each scheduled session, match punches falling into the session window. Identify Session In and Session Out.
3. **Compute Session Durations**: Calculate raw worked duration, late minutes, early exit, and deduct intra-session breaks.
4. **Evaluate Session Minimum Presence**: Compare worked duration to session threshold $\mu_j \times \text{ScheduledDuration}_j$. Tag `COMPLETED` or `BELOW_MIN`.
5. **Evaluate Daily Rollup ($R$)**: Compute $R = \sum \text{Worked} / \sum \text{Scheduled}$. Apply tenant policy bands to assign status (`PRESENT`, `HALF_DAY`, `ABSENT`).
6. **Apply Session Caps & Leave Overlays**: Check if any session is `BELOW_MIN` (cap at `HALF_DAY`). Overlay any approved session-targeted half-day leave (`N66c`).
7. **Generate Explanation Trace**: Build JSON payload with all intermediate timings, ratios, and flags.
8. **Persist Atomically**: Save `attendance_daily_records` and `attendance_explanation_traces` in an atomic database transaction.

## 7. Validation Checklist
- [ ] Does the implementation handle out-of-order punches cleanly?
- [ ] Is mid-shift gap time excluded from worked hours and overtime?
- [ ] Does a single punch assign `NEEDS_REVIEW` and flag `SINGLE_PUNCH_ANOMALY`?
- [ ] Are all explanation trace fields populated according to the JSON schema?

## 8. Common Mistakes to Avoid
- Summing total daily punch differences without checking session boundaries.
- Granting `PRESENT` status when an employee was completely absent for one entire session in a split shift.
- Overwriting manual admin punches during automatic recalculations.

## 9. Expected Output
Production-grade, fully typed Python code and pytest unit tests with 100% assertion passes on standard test vectors.

