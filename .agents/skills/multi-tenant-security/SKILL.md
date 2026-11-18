---
name: multi-tenant-security
description: Evaluates and implements security architecture, Row-Level Security isolation, PII envelope encryption, RBAC permissions, and DPDP Act 2023 compliance across APMS.
---

# APMS Multi-Tenant Security Skill

## 1. Purpose
Guides agents in auditing, implementing, and verifying multi-tenant data isolation, field-level encryption, cryptographic token security, and regulatory privacy compliance.

## 2. When to Activate
- When reviewing database models or API queries for tenant leakage.
- When handling PII fields (Aadhaar, PAN, Bank details, Salary).
- When implementing authentication dependencies or RBAC middleware.
- When conducting security reviews.

## 3. Required Documents to Read
- `CONTEXT.md §3,7 + docs/product/SRS.md §4.7` — Complete security architecture.
- `CONTEXT.md §3 (RLS invariants)` — Database RLS mechanisms.
- `.agents/rules/security.md` — Workspace security invariants.

## 4. Relevant Requirement IDs
- `SEC-01`, `SEC-02`, `PRV-01`, `PRV-02`, `IAM-01`, `IAM-02`, `ADR-02`, `ADR-13`, `ADR-27`.

## 5. Domain-Specific Constraints
- **Zero-Tolerance Leakage**: Under no circumstance may a query authenticated as Tenant A return data belonging to Tenant B.
- **Envelope Encryption**: Sensitive PII must be encrypted at rest using AES-256-GCM.
- **Context Injection**: Tenant context must be injected from verified JWT claims into PostgreSQL session variables (`SET LOCAL app.current_tenant_id = :tid`).

## 6. Step-by-Step Security Implementation Workflow
1. **Authentication Dependency**: FastAPI dependency validates JWT token, verifies signature, extracts `tenant_id` and `user_id`.
2. **Session Context Middleware**: Database session lifecycle executes `SET LOCAL app.current_tenant_id` on checkout.
3. **Envelope Encryption Service**: Use `KeyManagementService` to generate data encryption keys and encrypt sensitive fields before writing.
4. **RBAC Guard**: Enforce permission decorators (`@require_permission("payroll:execute")`) on API routes.
5. **Masking Service**: Intercept outgoing API responses to mask PAN (`XXXXXX1234`), Aadhaar (`XXXXXXXX1234`), and Bank Accounts.
6. **Consent & Audit Log**: Record explicit user consent during biometric enrollment and log all unmasking actions in `audit_logs`.

## 7. Validation Checklist
- [ ] Is `SET LOCAL app.current_tenant_id` invoked on every database connection?
- [ ] Are cross-tenant negative test assertions present and passing?
- [ ] Are PAN, Aadhaar, and Bank Account numbers encrypted in the database?
- [ ] Are sensitive fields masked in standard API responses?

## 8. Common Mistakes to Avoid
- Querying the database as a PostgreSQL superuser (which bypasses RLS).
- Filtering queries with `WHERE tenant_id = :id` in Python while omitting database-level RLS policies.
- Printing unencrypted PII in error logs.

## 9. Expected Output
Secure API routes, automated RLS cross-tenant test suites, and cryptographic encryption utilities.

