# APMS Engineering Definition of Done (DoD)

## 1. Overview & Purpose

The Definition of Done (DoD) ensures that every pull request, feature delivery, and architectural enhancement meets rigorous enterprise standards for security, compliance, performance, and maintainability prior to merging.

---

## 2. Universal Pull Request Checklist

Before any PR can be merged into `main`, all following gates must pass:

### 2.1 Domain & Architectural Traceability
- [ ] PR description references specific Requirement IDs (e.g. `ATT-07`, `N66a`) and Business Rules (e.g. `BR-ROL-01`).
- [ ] Any architectural change has a corresponding ADR created in `docs/decisions/` and indexed in `docs/decisions/DECISION_REGISTER.md`.
- [ ] No product recommendations or open questions were silently converted into approved decisions without explicit PO approval.

### 2.2 Security & Tenant Isolation
- [ ] Every new tenant-scoped table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- [ ] Automated cross-tenant isolation test suite passes with zero data leakage.
- [ ] Sensitive fields (Aadhaar, PAN, Bank Details, Base Salary) use AES-256 field-level envelope encryption.
- [ ] No raw PII or auth secrets logged in plain text.

### 2.3 Code Quality & Typing
- [ ] `mypy --strict` passes with 0 errors. No `Any` types in domain models.
- [ ] `ruff check` and `ruff format` pass with 0 linting violations.
- [ ] Code follows Python 3.12+ async patterns and SQLAlchemy 2.0 select syntax.

### 2.4 Testing & Verification
- [ ] Unit tests pass with $> 95\%$ coverage on business logic and $100\%$ on statutory formulas.
- [ ] Golden tests pass with exact paisa accuracy (±₹0.00).
- [ ] Explanation trace schema updated and validated if attendance or payroll calculations were modified.

### 2.5 Documentation
- [ ] Module specification under `docs/modules/<module>/SPEC.md` updated.
- [ ] `docs/requirements/REQUIREMENTS_CATALOG.md` updated if requirement status changed.

