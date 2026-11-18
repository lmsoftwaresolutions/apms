---
name: apms-domain-analysis
description: Analyzes APMS business domain problems, decodes workforce requirements, evaluates trade-offs, and validates compliance across attendance, shifts, leave, and payroll.
---

# APMS Domain Analysis Skill

## 1. Purpose
Guides agents in performing rigorous domain analysis for APMS features, comparing policy options, identifying statutory dependencies, and preparing structured product decision documents without inventing business rules.

## 2. When to Activate
- When analyzing new attendance, shift, leave, or payroll requirements.
- When evaluating unresolved product decisions (e.g. `Q5`, `N18`, open tenant policies).
- When assessing the domain impact of a proposed feature on existing business rules.

## 3. Required Documents to Read (Progressive Disclosure)
- `docs/product/PRD.md` — Personas, journeys, and system capabilities.
- `docs/requirements/BUSINESS_RULES.md` — Authoritative single source of truth for business rules.
- `docs/requirements/OPEN_QUESTIONS.md` — Current status of open and confirmed decisions.
- `docs/decisions/DECISION_REGISTER.md` — Existing architectural decisions.

## 4. Relevant Requirement IDs
- `PLT-*`, `SHF-*`, `ROS-*`, `ATT-*`, `LVE-*`, `PAY-*`, `STA-*`, `WFL-*`

## 5. Domain-Specific Constraints
- Never convert a recommendation into an approved decision without explicit PO authorization.
- Always distinguish CONFIRMED, RECOMMENDED, OPEN, and DEFERRED statuses.
- Multi-session shifts must always exclude mid-shift gaps from worked time (`N65`).
- Daily attendance status is decoupled from payroll wages.

## 6. Step-by-Step Workflow
1. **Identify the Core Problem**: Formulate the exact operational challenge across target industries (manufacturing, healthcare, coaching, etc.).
2. **Retrieve Authoritative Truths**: Read `BUSINESS_RULES.md` and `REQUIREMENTS_CATALOG.md` to identify dependent rules.
3. **Formulate Options**: Present viable alternatives with concrete mathematical formulas and edge cases.
4. **Evaluate Cross-Module Impact**: Check interactions between Shifts (`M3`), Pairing (`M4`), Attendance Rollup (`M5`), Leave (`M6`), and Payroll (`M7`).
5. **Formulate Recommendation**: State the architectural recommendation, explain the rationale, and specify what must remain tenant-configurable.
6. **Output Decision Proposal**: Structure as an ADR or formal decision analysis document.

## 7. Validation Checklist
- [ ] Are all cited requirement IDs valid and matched to `REQUIREMENTS_CATALOG.md`?
- [ ] Are recommendations clearly marked as `RECOMMENDED` rather than `CONFIRMED`?
- [ ] Are edge cases (e.g. overnight shifts, single punches, unequal sessions) explicitly addressed?
- [ ] Is payroll calculation kept strictly separate from attendance rollup?

## 8. Common Mistakes to Avoid
- Assuming 9-to-5 single-session shifts apply to all industries.
- Conflating worked hours with payroll payable days.
- Overwriting existing confirmed decisions (`N65`, `N66a–d`, `N67`).

## 9. Expected Output
A structured domain analysis document or ADR adhering to `docs/decisions/adr/ADR_TEMPLATE.md`.

