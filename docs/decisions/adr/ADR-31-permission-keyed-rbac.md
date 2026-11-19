# ADR-31: Permission-keyed RBAC

## Status
PROPOSED

## Context & Problem Statement
Draft schema `docs/database/schema.dbml` stores a single `user_role_enum` on `users.role` (`SUPER_ADMIN`, `TENANT_ADMIN`, `HR_PAYROLL`, `SUPERVISOR`, `EMPLOYEE`). That label cannot express module-level create, read, update, and delete. A shift supervisor must read and update branches and later fix punches without gaining role administration or payroll.

The first code slice (`backend/alembic/versions/001_iam_branches.py`) already uses permission keys and role bundles. This ADR records that model so later modules do not reintroduce a single role check.

Product access still sits behind PostgreSQL RLS (`ADR-02`). A permission grant never crosses tenants.

## Decision Drivers
- Security and tenant isolation
- Per-module CRUD without a new role enum for every screen
- Maintainability as M01–M21 ship
- Alignment with the code already on `docs/v1-paid-day-scope`

## Considered Options
1. Keep `users.role` as the only authorization check.
2. Permission keys `{module}.{resource}.{action}` with roles as bundles (implemented slice).
3. Full ABAC policy engine in V1 (attribute rules per request).

## Decision Outcome
Chosen option: **permission-keyed RBAC**, because the first slice already enforces it and a single enum cannot express the supervisor matrix.

Grammar: `{module}.{resource}.{action}` with actions exactly `create`, `read`, `update`, `delete`. A new action requires a later ADR.

Effective permissions are the union of roles assigned to the user in the current tenant. Every API route declares `require_permission`. The UI hides actions the caller lacks. The database still applies RLS via `app.current_tenant_id`.

`users.role` in `schema.dbml` is superseded for authorization. Seed role codes (`TENANT_ADMIN`, `SUPERVISOR`, `EMPLOYEE`) remain as bundles, not as the check.

### Positive Consequences
- Each module ships its own CRUD keys without changing a global enum.
- Supervisor and admin matrices stay data, not code branches.
- Cross-tenant denial stays in RLS even if a permission check is missed.

### Negative Consequences / Trade-offs
- Catalog rows must be seeded before routes that require them.
- Two sources (`schema.dbml` enum vs this model) until the schema draft is revised. Mitigation: treat this ADR and `docs/engineering/IAM_RBAC.md` as the access-control spec; do not add new checks against `user_role_enum`.

## Validation & Verification Plan
- Permission matrix test: allowed key succeeds; missing key returns 403.
- Two-tenant RLS test: tenant B cannot read tenant A rows.
- Union test: two roles combine keys.

## References
- Requirement IDs: `IAM-01`, `IAM-02`, `ARCH-04` (SRS)
- Related ADRs: `ADR-02`, `ADR-03`
- Spec: `docs/engineering/IAM_RBAC.md`
