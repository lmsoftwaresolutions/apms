---
name: database-design
description: Designs, reviews, and migrates APMS PostgreSQL 16+ schemas, ensuring Row-Level Security (RLS) enforcement, composite foreign keys, declarative partitioning, and performance indexing.
---

# APMS Database Design Skill

## 1. Purpose
Provides mandatory rules and step-by-step procedures for creating database schemas, writing Alembic migrations, optimizing queries, and enforcing multi-tenant isolation and partitioning in PostgreSQL 16+.

## 2. When to Activate
- When creating or modifying database models or tables.
- When writing Alembic migration scripts.
- When designing high-throughput tables (`raw_envelope`, `punch_event`).
- When diagnosing query performance or indexing issues.

## 3. Required Documents to Read
- `docs/architecture/DATABASE_DESIGN.md` — Database architecture and schema specifications.
- `docs/architecture/SECURITY_ARCHITECTURE.md` — RLS enforcement and encryption standards.
- `.agents/rules/security.md` — Workspace security rules.

## 4. Relevant Requirement IDs
- `PLT-01`, `PLT-05`, `SEC-01`, `ADR-02`, `ADR-04`, `ADR-28`.

## 5. Domain-Specific Constraints
- **RLS Non-Negotiable**: Every tenant-scoped table MUST have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- **Composite Foreign Keys**: All foreign key constraints on tenant tables must include `(tenant_id, foreign_id)`.
- **Declarative Partitioning**: High-volume punch tables must use monthly range partitioning on timestamp columns.

## 6. Step-by-Step Migration Workflow
1. **Model Definition**: Define SQLAlchemy 2.0 mapped model with explicit `tenant_id: Mapped[UUID]`.
2. **Generate Alembic Migration**: Run `alembic revision -m "..."`.
3. **Inject RLS Directives**: Inside the migration file's `upgrade()` function, add:
   ```python
   op.execute("ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;")
   op.execute("ALTER TABLE <table> FORCE ROW LEVEL SECURITY;")
   op.execute("""
       CREATE POLICY tenant_isolation_policy ON <table>
       FOR ALL
       USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
       WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
   """)
   ```
4. **Composite Unique & FK Constraints**: Ensure child tables reference parent via composite `(tenant_id, id)` foreign keys.
5. **Partition Setup (If applicable)**: Configure `PARTITION BY RANGE (timestamp_col)` and create initial partitions.
6. **Write Automated RLS Test**: Add an integration test asserting that Tenant A cannot query Tenant B's records.

## 7. Validation Checklist
- [ ] Does the migration include `ENABLE` and `FORCE ROW LEVEL SECURITY`?
- [ ] Does the migration include `CREATE POLICY` checking `app.current_tenant_id`?
- [ ] Are foreign keys composite including `tenant_id`?
- [ ] Does `downgrade()` drop the policy and table cleanly?

## 8. Common Mistakes to Avoid
- Creating a table without RLS policies.
- Using simple single-column foreign keys (`REFERENCES parent(id)`), allowing cross-tenant data leaks.
- Creating non-partitioned tables for raw punch ingestion.

## 9. Expected Output
Alembic migration script with complete RLS policies and an accompanying automated RLS test suite.

