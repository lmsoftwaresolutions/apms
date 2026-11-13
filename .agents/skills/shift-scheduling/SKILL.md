---
name: shift-scheduling
description: Analyzes, designs, implements, and tests APMS shift management, rotation patterns, dated shift instances, and ad-hoc same-day modifications.
---

# APMS Shift Scheduling Skill

## 1. Purpose
Guides agents in building and maintaining the shift scheduling engine (`M3`), covering shift templates (fixed, overnight, split), rotation patterns, automated generation of dated shift instances, and the confirmed N67 dual-path ad-hoc modification workflow.

## 2. When to Activate
- When working on shift template schemas or rotation generator jobs.
- When implementing ad-hoc same-day shift modifications (`N67`).
- When implementing employer-cancelled sessions (`N66d`, `ROS-10`).
- When debugging overnight boundary date attribution.

## 3. Required Documents to Read
- `docs/modules/shifts/SPEC.md` — Complete shift module specification.
- `docs/requirements/BUSINESS_RULES.md#br-att-03-overnight-shift-attribution` — Overnight attribution.
- `docs/requirements/BUSINESS_RULES.md#br-rol-06-ad-hoc-same-day-schedule-modifications-confirmed-n67` — N67 rules.

## 4. Relevant Requirement IDs
- `SHF-01` through `SHF-04`, `ROS-01` through `ROS-06`, `ROS-10`, `N67`, `N66d`.

## 5. Domain-Specific Constraints
- **Materialization Invariant (ADR-15)**: Recurring shift patterns must materialize into concrete `dated_shift_instance` rows before attendance calculation.
- **Master Template Protection**: Ad-hoc changes must never modify recurring templates; they modify only the targeted date's `dated_shift_instance`.
- **Recalculation Trigger**: Modifying a dated shift instance must immediately enqueue an asynchronous re-pairing job for affected employees.

## 6. Step-by-Step Implementation Workflow
1. **Define Shift Template**: Model session start/end times, pre/post ingestion windows, grace periods, and break rules.
2. **Implement Materialization Job**: Create background job expanding rotation cycles into 30-day future `dated_shift_instance` records.
3. **Implement Overnight Logic (`SHF-02`)**: If $T_{end} < T_{start}$, set `is_overnight = true` and ensure all punches up to $T_{end} + W_{post}$ attribute to the start date.
4. **Implement N67 Dual-Path Modification**:
   - Path 1: Direct supervisor override endpoint updating `dated_shift_instance` with `is_adhoc_modified = true`.
   - Path 2: Employee request routing through workflow engine (`M9`).
5. **Publish Event**: Emit `shift.modified` event on Redis to trigger attendance re-pairing.

## 7. Validation Checklist
- [ ] Does overnight shift pairing correctly assign next-morning exit punches to the previous day's shift instance?
- [ ] Does modifying a dated shift instance leave recurring shift templates unchanged?
- [ ] Does an ad-hoc modification successfully trigger attendance re-pairing?

## 8. Common Mistakes to Avoid
- Evaluating shifts dynamically on-the-fly during punch pairing rather than reading materialized instances.
- Forgetting to invalidate existing attendance records when a shift instance is overridden.

## 9. Expected Output
Tested shift service models, rotation generation background tasks, and ad-hoc override API endpoints.

