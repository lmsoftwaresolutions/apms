---
name: documentation-maintenance
description: Updates, synchronizes, and audits APMS documentation, requirements catalogs, decision registers, and module specifications to prevent drift.
---

# APMS Documentation Maintenance Skill

## 1. Purpose
Guides agents in keeping all APMS technical and product documentation fully synchronized with code, recording decisions, updating requirement statuses, and preventing documentation drift.

## 2. When to Activate
- When a product decision is approved or updated by the Product Owner.
- When an Architectural Decision Record (ADR) is proposed or accepted.
- When a module specification undergoes structural changes.
- During periodic documentation audits.

## 3. Required Documents to Read
- `docs/product/SRS.md` — Central requirements catalog.
- `docs/requirements/BUSINESS_RULES.md` — Authoritative business rules.
- `docs/decisions/DECISION_REGISTER.md` — Master ADR index.
- `docs/decisions/adr/ADR_TEMPLATE.md` — Standard ADR template.

## 4. Relevant Requirement IDs
- All requirement categories (`PLT`, `IAM`, `SHF`, `ROS`, `ATT`, `LVE`, `PAY`, `STA`, etc.).

## 5. Domain-Specific Constraints
- **Single Source of Truth**: Never maintain duplicate copies of business rules across files. Maintain the rule in `BUSINESS_RULES.md` and link to it from module specs.
- **Explicit Status Integrity**: Never change an item from `RECOMMENDED` or `OPEN` to `CONFIRMED` without verified Product Owner approval.
- **Stable IDs**: Requirement IDs (`ATT-01`, `PAY-02`) and decision IDs (`N65`, `N66a`) must remain immutable once established.

## 6. Step-by-Step Documentation Workflow
1. **Identify Change Scope**: Determine which requirements, business rules, or architectural decisions are impacted.
2. **Draft ADR (If architectural)**: Copy `ADR_TEMPLATE.md` to `docs/decisions/adr/ADR-XX-<title>.md`, populate context, options, decision, and trade-offs.
3. **Update Decision Register**: Add the new ADR to `docs/decisions/DECISION_REGISTER.md`.
4. **Update Business Rules**: If domain math or policy bands change, update `docs/requirements/BUSINESS_RULES.md` with explicit formulas.
5. **Update SRS**: Change requirement status in `docs/product/SRS.md` when scope moves.
6. **Update CONTEXT**: Keep module catalog / pricing / roadmap in `CONTEXT.md` synchronized — do not recreate deleted narrative specs.

## 7. Validation Checklist
- [ ] Are all cross-document markdown links valid?
- [ ] Do requirement IDs match across `docs/product/SRS.md` and `BUSINESS_RULES.md`?
- [ ] Does `CONTEXT.md` remain the only product SSOT (no duplicate vision/PRD files)?
- [ ] Are all newly confirmed decisions accurately indexed in `DECISION_REGISTER.md`?

## 8. Common Mistakes to Avoid
- Updating code or tests without updating corresponding module specifications.
- Creating orphaned ADR files that are not indexed in `DECISION_REGISTER.md`.

## 9. Expected Output
Updated, internally consistent Markdown documentation with verified links and status tags.

