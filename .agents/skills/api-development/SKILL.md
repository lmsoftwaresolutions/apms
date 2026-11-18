---
name: api-development
description: Designs, develops, and documents high-performance, asynchronous REST APIs in FastAPI, following APMS endpoint conventions, Pydantic validation, and idempotency standards.
---

# APMS API Development Skill

## 1. Purpose
Guides agents in creating clean, robust, asynchronous FastAPI REST endpoints adhering to APMS API standards, OpenAPI documentation, Pydantic v2 schemas, and RFC 7807 error responses.

## 2. When to Activate
- When creating new REST API endpoints under `/api/v1`.
- When designing request and response Pydantic schemas.
- When implementing idempotency handling, keyset pagination, or webhook triggers.

## 3. Required Documents to Read
- `docs/product/SRS.md + CONTEXT.md processor contracts` — REST API architecture and conventions.
- `AGENTS.md + CONTEXT.md stack` — Backend coding standards.
- `.agents/rules/architecture.md` — Architecture rules.

## 4. Relevant Requirement IDs
- `PLT-01`, `PLT-02`, `IAM-02`, `NFR-01`, `ADR-03`.

## 5. Domain-Specific Constraints
- **Versioned Routes**: All endpoints must reside under `/api/v1`.
- **Stateless Handlers**: Endpoints must be stateless; never store mutable global state in FastAPI app instances.
- **Strict Pydantic Models**: All incoming request bodies and outgoing responses must use validated Pydantic models.
- **Idempotency**: Mutating operations (e.g. executing pay runs, uploading punches) must support the `Idempotency-Key` header.

## 6. Step-by-Step API Development Workflow
1. **Define Schema**: Create Pydantic v2 input and output schemas in `app.schemas.<module>`.
2. **Implement Service Layer**: Encapsulate domain logic inside a dedicated service class in `app.services.<module>`.
3. **Define Router**: Add async route handler in `app.api.v1.endpoints.<module>`:
   ```python
   @router.post("/pay-runs/{id}/execute", response_model=StandardResponse[PayRunResponse])
   async def execute_pay_run(
       id: UUID,
       db: AsyncSession = Depends(get_db_session),
       current_user: UserContext = Depends(require_permission("payroll:execute")),
       idempotency_key: str | None = Header(None)
   ):
       ...
   ```
4. **Error Handling**: Use RFC 7807 problem details envelope for all non-2xx responses.
5. **Add Integration Tests**: Write async pytest integration tests covering happy paths, validation errors, and unauthorized access.

## 7. Validation Checklist
- [ ] Are Pydantic schemas strictly typed with no `Any`?
- [ ] Is authentication and permission dependency properly injected?
- [ ] Is the response wrapped in the standard API response envelope?
- [ ] Is an OpenAPI description and summary provided?

## 8. Common Mistakes to Avoid
- Putting business logic directly inside FastAPI route functions instead of service classes.
- Returning raw SQLAlchemy ORM entities directly in responses without Pydantic serialization.
- Swallowing exceptions and returning generic 500 Internal Server Errors.

## 9. Expected Output
Complete FastAPI router module, Pydantic schemas, and accompanying pytest integration tests.

