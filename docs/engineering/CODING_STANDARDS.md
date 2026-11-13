# APMS Engineering Coding Standards

## 1. Core Engineering Principles

Every line of code in APMS must adhere to three foundational engineering principles:
1. **Safety First**: Never bypass or mock out multi-tenant isolation, authorization checks, or data encryption.
2. **Deterministic & Explicit**: Code must be predictable. Never rely on implicit time zones, unseeded random values, or hidden global states.
3. **Domain Traceability**: Always tag business logic with the authoritative requirement ID (e.g. `# Implements: BR-ROL-01, N66a`).

---

## 2. Backend Standards (Python 3.12+ / FastAPI)

### 2.1 Typing & Validation
- **Strict Typing**: All functions, methods, and variables must have explicit type annotations. Use Python 3.12 union syntax (`int | None`). `Any` is strictly forbidden in production domain code.
- **Pydantic v2**: All API input and output payloads must use Pydantic v2 models with rigorous field validation:
  ```python
  from pydantic import BaseModel, Field, UUID4
  from datetime import time

  class SessionDefinition(BaseModel):
      session_index: int = Field(ge=1, le=10)
      start_time: time
      end_time: time
      min_presence_minutes: int = Field(ge=15)
  ```

### 2.2 Database Access & Multi-Tenancy (SQLAlchemy 2.0)
- Always use asynchronous SQLAlchemy 2.0 style queries:
  ```python
  stmt = select(AttendanceDailyRecord).where(
      AttendanceDailyRecord.tenant_id == tenant_id,
      AttendanceDailyRecord.employee_id == employee_id,
      AttendanceDailyRecord.attendance_date == target_date
  )
  result = await session.execute(stmt)
  ```
- **Connection Hooks**: Ensure the current tenant session variable is set:
  ```python
  await session.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": str(tenant_id)})
  ```

### 2.3 Exception Handling
- Use structured domain exceptions inheriting from `APMSException`.
- Never expose internal database errors or raw tracebacks to the client.

---

## 3. Frontend Standards (React 18+ / TypeScript / Vite)

### 3.1 Component Architecture & State
- **Strict TypeScript**: `noImplicitAny: true` enabled. No `any` types.
- **Server State**: Managed exclusively through TanStack Query (`@tanstack/react-query`). Use query invalidation on mutations.
- **UI Components**: Build on Radix UI primitives and Tailwind CSS.
- **Forms**: Use `react-hook-form` with `@hookform/resolvers/zod` for client-side validation mirroring backend Pydantic schemas.

---

## 4. Git & Commit Hygiene

- **Branch Naming**:
  - `feat/<module>-<short-description>` (e.g. `feat/attendance-n66a-rollup`)
  - `fix/<module>-<short-description>` (e.g. `fix/payroll-epf-wage-ceiling`)
  - `docs/<short-description>` (e.g. `docs/update-decision-register`)
- **Conventional Commits**:
  - Format: `<type>(<scope>): <short imperative description>`
  - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
  - Example: `feat(attendance): implement N66a duration ratio daily rollup algorithm`

