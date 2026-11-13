---
trigger: model_decision
description: Code quality, typing, testing, migration safety, and Git hygiene standards.
---

# APMS Development & Quality Invariants

## 1. Type Safety & Code Quality
1. **Strict Type Annotations**: Python code must pass `mypy --strict` with zero errors. The use of `Any` is strictly forbidden in production business logic.
2. **Pydantic Validation**: All API request and response bodies must use validated Pydantic v2 schemas.
3. **Database Select Syntax**: Use SQLAlchemy 2.0 2.0 select syntax (`select(Model).where(...)`). Legacy query syntax (`session.query(Model)`) is prohibited.

## 2. Testing Invariants
1. **100% Statutory Formula Coverage**: Statutory calculations (EPF, ESI, PT, TDS) must have 100% test coverage with exact-paisa golden assertions (±₹0.00).
2. **Mandatory RLS Isolation Test**: Every new tenant-scoped entity must include an automated negative test verifying zero cross-tenant query leaks under RLS.
3. **Idempotency Verification**: Background workers, punch ingestion, and daily rollup tasks must be tested for safe idempotency on repeated execution.

## 3. Migration & Deployment Safety
1. **Zero-Downtime Schema Migrations**: Column additions must be nullable or possess safe server defaults. No long table locks on partitioned ingestion tables.
2. **Never Commit Secrets**: Master encryption keys, JWT secrets, and database passwords must be loaded strictly via environment variables.

