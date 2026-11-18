---
name: code-review
description: Conducts rigorous architectural, security, domain, and quality code reviews of APMS pull requests against Definition of Done standards.
---

# APMS Code Review Skill

## 1. Purpose
Guides agents in performing thorough peer code reviews on APMS branches, enforcing architectural invariants, RLS tenant isolation, domain rule compliance, and quality benchmarks prior to merge.

## 2. When to Activate
- When reviewing a completed pull request or feature branch.
- When validating whether an implementation satisfies its Definition of Done.
- When checking for regressions against confirmed decisions (`N65`, `N66a–d`, `N67`, `Q4`, `Q6`, `N20`).

## 3. Required Documents to Read
- `CONTEXT.md §9 MVP DoD + docs/product/SRS.md §6` — Mandatory PR checklist and quality gates.
- `docs/requirements/BUSINESS_RULES.md` — Authoritative business rules.
- `.agents/rules/apms-core.md` — Core business invariants.
- `.agents/rules/security.md` — Security invariants.

## 4. Relevant Requirement IDs
- All requirements linked to the targeted pull request.

## 5. Domain-Specific Constraints
- **Zero Cross-Tenant Leakage**: Block any PR where a tenant table lacks RLS policies or composite foreign keys.
- **No In-Place Punch Mutations**: Block any PR modifying or deleting records in `raw_envelope` or `punch_event`.
- **No Floating-Point Money**: Block any PR using `float` for currency calculations.
- **Traceability Required**: Block any PR implementing domain logic without citing Requirement IDs.

## 6. Step-by-Step Code Review Workflow
1. **Traceability Check**: Verify that the PR references valid Requirement IDs (`ATT-*`, `PAY-*`, etc.) and does not invent undocumented product rules.
2. **Security & RLS Audit**: Inspect all database queries and migrations. Verify that RLS is enabled and forced, and that `app.current_tenant_id` is set.
3. **Domain Logic Audit**: Compare implementation math against `BUSINESS_RULES.md` (e.g. check if mid-shift gaps are excluded, check if DURATION_RATIO rollup handles session minimum presence).
4. **Code Quality & Typing**: Run `mypy --strict` and `ruff check`. Confirm absence of `Any` types.
5. **Test Review**: Verify that unit, RLS negative, and golden test suites accompany the code and pass.
6. **Formulate Structured Review**: Output review findings categorized as Blockers (must fix), Suggestions (improvements), and Approval.

## 7. Validation Checklist
- [ ] Are all Definition of Done checklist items checked?
- [ ] Are there any unencrypted sensitive PII fields?
- [ ] Does the code adhere to the modular monolith boundaries?
- [ ] Are background tasks idempotent?

## 8. Common Mistakes to Avoid
- Giving a rubber-stamp approval without inspecting database migrations for RLS policies.
- Overlooking subtle floating-point rounding errors in payroll calculations.

## 9. Expected Output
A structured markdown code review report with line-specific feedback, compliance status, and clear merge verdict (Approve / Request Changes).

