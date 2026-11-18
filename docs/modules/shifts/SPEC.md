# Module Specification: Shifts & Rostering Engine (M3)

## 1. Module Overview & Scope

The Shifts & Rostering Engine manages the lifecycle of work schedules across the organization. It enables defining recurring shift templates, complex rotation patterns (e.g. 6-1, cyclical 3-shift rotations), and materializing them into concrete, immutable **Dated Shift Instances** (`dated_shift_instance`).

It handles the confirmed **N67 dual-path same-day schedule modifications**, ensuring that ad-hoc supervisor overrides and approved employee requests update the dated instance and trigger attendance recalculation without mutating master templates.

---

## 2. Applicable Requirements & Decisions

- **Requirements**: `SHF-01` (Fixed Shift), `SHF-02` (Overnight Shift), `SHF-03` (Multi-Session Shift), `SHF-04` (Flexible Window), `SHF-06` (Dynamic Shift Matching & Pooling), `ROS-01` through `ROS-06`, `ROS-10`.
- **Decisions**:
  - `N67`: Dual-path ad-hoc same-day schedule modifications (`BR-ROL-06`).
  - `N66d`: Employer-cancelled sessions (`ROS-10`, `BR-ROL-05`).
  - `ADR-15`: Materialized dated shift instances.

---

## 3. Shift Data Architecture

```mermaid
classDiagram
    class ShiftTemplate {
        +UUID id
        +UUID tenant_id
        +String code
        +String name
        +ShiftType type
        +JSONB session_definitions
        +JSONB grace_and_breaks
    }

    class ShiftPool {
        +UUID id
        +UUID tenant_id
        +String name
        +List~UUID~ eligible_shift_ids
        +String auto_match_strategy
    }

    class RosterPattern {
        +UUID id
        +UUID tenant_id
        +String name
        +Int cycle_length_days
        +JSONB day_shift_mapping
    }

    class DatedShiftInstance {
        +UUID id
        +UUID tenant_id
        +UUID employee_id
        +Date shift_date
        +UUID shift_template_id
        +String resolution_mode
        +JSONB sessions
        +Boolean is_adhoc_modified
        +String modification_reason
        +UUID modified_by_user_id
    }

    ShiftTemplate "1" <-- "*" DatedShiftInstance
    ShiftPool "1" ..> "*" ShiftTemplate : groups
    RosterPattern "1" ..> "*" DatedShiftInstance : generates
```

---

## 4. Key Workflows & Invariants

### 4.1 Shift Instance Materialization (`ROS-03`)
- A background scheduler periodically materializes dated shift instances $N$ days in advance (default: 30 days).
- Shift instances copy session start/end definitions, grace thresholds, and break configurations from the active template at creation time.
- Future changes to a `ShiftTemplate` do not retroactively alter previously materialized instances.

### 4.2 Ad-Hoc Same-Day Modifications (`N67`, `BR-ROL-06`)
- **Direct Supervisor Override**:
  - Endpoint: `POST /api/v1/shifts/instances/{id}/override`
  - Requires supervisor role.
  - Updates `DatedShiftInstance` with new shift timings, sets `is_adhoc_modified = true`, and logs previous state.
- **Employee Request**:
  - Endpoint: `POST /api/v1/shifts/requests/adhoc-change`
  - Routes through approval workflow (`M9`). Upon supervisor approval, executes update.
- **Recalculation Trigger**:
  - In both paths, a `shift.modified` event is published to Redis.
  - The attendance engine immediately un-pairs existing punches for that employee/date and executes re-pairing against the modified shift instance.

### 4.3 Auto-Shift Allocation & Dynamic Matching (`SHF-06`)
- **Use Case**: Eliminates manual daily roster overhead for factory workers, hospital nurses, and security staff who rotate among 2 or 3 standard shifts without a rigid calendar roster.
- **Shift Pool Assignment**: An employee or department is assigned a `ShiftPool` containing candidate shifts:
  $$\text{Pool} = \{ S_1: \text{06:00–14:00}, S_2: \text{14:00–22:00}, S_3: \text{22:00–06:00} \}$$
- **Dynamic Resolution Algorithm**:
  1. When the first punch $P_{in}$ arrives, evaluate each candidate shift $S_i \in \text{Pool}$.
  2. Candidate shift must satisfy: $T_{start, i} - W_{pre} \le P_{in} \le T_{start, i} + W_{window}$.
  3. Calculate arrival delta: $\Delta_i = |P_{in} - T_{start, i}|$.
  4. Select shift $S^*$ with minimum delta $\min(\Delta_i)$.
  5. Upon $P_{out}$ arrival, validate that worked duration falls within $S^*$'s allowable duration bounds. If there is a cross-shift boundary ambiguity, the shift with maximum overlap ratio is chosen.
  6. Materialize `DatedShiftInstance` with `resolution_mode = 'AUTO_DYNAMIC_MATCH'`.
  7. If no candidate shift matches within the valid windows, flag the punch with `UNRESOLVED_SHIFT_ANOMALY` in the Human Exception Queue.

