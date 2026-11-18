---
trigger: model_decision
description: Architectural constraints governing modular monolith boundaries, database patterns, and service interactions.
---

# APMS Architectural Constraints

## Module Boundaries & Coupling
1. **Modular Monolith Integrity**: APMS is a modular monolith. Direct cross-module SQL joins or direct imports of internal models across modules are strictly prohibited. Interactions must use internal service interfaces, Pydantic schemas, or domain events.
2. **PostgreSQL 16+ as Source of Truth**: Relational integrity, foreign keys, and RLS policies are enforced by PostgreSQL. Redis is used solely for task queues, caching, and pub/sub.
3. **Materialized Shift Instances (ADR-15)**: Recurring shift patterns must be materialized into concrete `dated_shift_instance` rows prior to attendance pairing.
4. **Ad-Hoc Same-Day Shifts (Confirmed N67)**: Supervisor overrides and employee requests modify the specific date's `dated_shift_instance` without altering recurring templates, and must trigger immediate asynchronous re-pairing.
5. **Declarative Partitioning**: High-volume ingestion tables (`raw_envelope`, `punch_event`) must employ monthly declarative range partitioning.
6. **Stateless API Services**: All HTTP API endpoints must remain stateless, delegating asynchronous or heavy operations (pay runs, PDF generation, bulk punch processing) to background worker queues.

