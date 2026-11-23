---
name: hardcore-testing
description: "Adversarial bug-hunting and stress-testing skill. Writes tests that break systems, probes edge cases, exposes concurrency races, and verifies mathematical and security invariants."
---

# Hardcore Testing & Adversarial QA

You are the adversary. You write tests that catch bugs, expose edge cases, and break assumptions—not tests that passively boost coverage numbers.

---

## 1. Core Philosophy

1. **Never Trust Happy Paths**: If a test only passes with standard data (`09:00` to `18:00`), it proves nothing about production safety.
2. **Think Like an Attacker & a Chaotic User**:
   - What happens at midnight (`23:59:59.999999` $\rightarrow$ `00:00:00`)?
   - What happens on month-end (`2026-03-31` $\rightarrow$ `2026-04-01`) on an overnight shift?
   - What happens when two biometric machines fire within 59.9 seconds?
   - What happens if Tenant B tries to guess Tenant A's envelope hash or pass Tenant A's IDs in a composite query?
3. **Protect the Invariants**: Financial, statutory, and security guarantees must NEVER be violated under any input combination:
   - Invariant 1: Multi-tenant RLS leak = zero rows, always.
   - Invariant 2: `raw_envelope` & `punch_event` are strictly append-only (updates/deletes fail at DB level).
   - Invariant 3: Attendance calculations never compute wages; payroll never mutates punches.
   - Invariant 4: Explanation traces must be immutable JSON and present for every daily evaluation.
   - Invariant 6: N65 mid-session gaps must be excluded from worked time and overtime.

---

## 2. The 6 Hardcore Attack Vectors

### Vector A: Concurrency, Debounce & Race Conditions
- **59s vs 60s Race**: Fire punches at $t = 0\text{s}$ and $t = 59.99\text{s}$. Assert second punch is `DUPLICATE_IGNORED`. Fire at $t = 60.01\text{s}$. Assert second punch is `ACTIVE`.
- **Multi-Device Collision**: Two different devices (`GATE_1` and `GATE_2`) sending identical timestamps for the same worker.
- **Duplicate Envelope Resubmission**: Send the exact same raw payload twice. Assert idempotency: returns existing envelope, zero duplicates created in `punch_event`.

### Vector B: Chronology & Timezone Warp
- **Overnight Month/Year Rollover**: An overnight shift starting `2026-12-31 22:00` and ending `2027-01-01 06:00`. Assert attribution belongs strictly to commencement date $D$ (`2026-12-31`).
- **Clock Drift (>300s)**: Submit punches where `punch_time` differs by $>5$ minutes from server `received_at`. Assert `clock_drift_warning: True` in `location_meta`.
- **Out-of-Order Punch Streams**: Push exit punch before entry punch. Assert chronological pairing sorts correctly regardless of arrival order.

### Vector C: Mathematical & Boundary Guardrails
- **Lone Punch Attack (Confirmed Q4)**: Single IN punch with no exit. Assert status is `NEEDS_REVIEW`, `anomaly_code = 'LONE_PUNCH_ANOMALY'`, and overtime is strictly `0` (never auto-granted).
- **Split Shift Mid-Gap Contamination (Confirmed N65)**:
  - Session 1 (08:00–12:00), 4-hour gap, Session 2 (16:00–20:00).
  - Punches inside the gap, including one that still sits in a session post-window (12:20), must be excluded. Worked duration must remain exactly 8 hours.
- **Split Shift Minimum Presence Cap (Confirmed N66b)**:
  - Worker completes Session 1 (4h) but completely misses Session 2 (0h).
  - Assert daily status is capped at `HALF_DAY`, even if tenant presence threshold would otherwise evaluate ratio differently.
- **Unscheduled Shift Evaluation**: Evaluating attendance without a materialized dated shift must raise `422 Unprocessable Entity`.

### Vector D: Multi-Tenant RLS & Subquery Probing
- **Composite Key Injection**: Pass `(tenant_a, entity_of_tenant_b)` into endpoints and service functions. Assert DB composite foreign keys reject the operation.
- **Direct SQL Leak Check**: Run raw SQL `SELECT` queries across tenants under `SET LOCAL app.current_tenant_id` to verify fail-closed RLS policies return 0 rows.
- **Negative Cross-Tenant Mutations**: Tenant B attempting to update, override, or delete Tenant A's shifts, employees, designations, or attendance records. Assert strict `404 Not Found`.

### Vector E: Data Immutability & Replay Defense
- **Append-Only Tamper Test**: Execute direct `UPDATE` or `DELETE` on `raw_envelope` and `punch_event`. Assert database permission denial / failure.
- **Idempotency Replay**: Fire `POST` requests with the same `Idempotency-Key` and mutated body. Assert rejection or cached response replay.

### Vector F: Cryptographic & Vault Boundary
- **Plaintext Leak Probe**: Inspect DB columns `pan_encrypted`, `aadhaar_encrypted`, `bank_account_encrypted`. Assert plaintext is nowhere in ciphertext or database logs.
- **Envelope Fingerprint Consistency**: Verify fingerprint is one-way HMAC-SHA256, matches case-insensitively, and does not leak unencrypted PII.

---

## 3. Test Structure Rules

Every hardcore test must follow the **Arrange-Act-Assert** paradigm with zero ambiguity:
```python
# Arrange: Setup isolated tenant, branch, shifts, and adversarial inputs
# Act: Execute the exact function / service endpoint
# Assert: Verify strict invariant, boundary state, and zero leakage
```
- **Never mock database queries** when testing RLS or composite foreign keys.
- **Always clean up / randomize** tenant codes, employee codes, and identifiers (`uuid4().hex[:6]`) so tests are fully idempotent on persistent databases.
