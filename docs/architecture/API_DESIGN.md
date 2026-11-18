# APMS REST API Architecture & Standards

## 1. REST API Conventions

All external and client-facing endpoints in APMS adhere to modern RESTful architecture principles, versioned under `/api/v1`.

### 1.1 URL Structure & Naming
- Resource names are plural nouns in kebab-case or snake_case: `/api/v1/shift-templates`, `/api/v1/attendance-records`.
- Hierarchical nesting represents true sub-resource ownership: `/api/v1/employees/{id}/leave-balances`.
- Actions beyond CRUD use standard verb suffixes: `POST /api/v1/pay-runs/{id}/execute`, `POST /api/v1/attendance-records/{id}/regularize`.

---

## 2. Authentication & Tenant Context

Every request must present an authenticated JWT Bearer token:
```http
Authorization: Bearer <jwt_access_token>
```

### Tenant Context Resolution
The tenant identity is encoded inside the verified JWT claims (`tid`). The backend FastAPI authentication dependency extracts `tenant_id` and sets PostgreSQL session context:
```sql
SET LOCAL app.current_tenant_id = '018f3a5b-9a8c-7000-8b01-234567890abc';
```
Any mismatch between URL tenant parameters and token claims produces an immediate `403 Forbidden`.

---

## 3. Standard Request & Response Envelopes

### 3.1 Success Response Envelope
All non-streaming responses return JSON structured as:
```json
{
  "success": true,
  "data": {
    "id": "018f3a5b-9a8c-7000-8b01-234567890abc",
    "name": "General Factory Shift",
    "status": "ACTIVE"
  },
  "meta": {
    "timestamp": "2026-11-13T14:00:00Z",
    "requestId": "req_01j7b9k4"
  }
}
```

### 3.2 Error Response Envelope
Errors strictly follow RFC 7807 (Problem Details for HTTP APIs):
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The punch timestamp falls outside any active session ingestion window.",
    "details": [
      {
        "field": "punch_time",
        "issue": "Punch time 2026-11-13T03:15:00Z exceeds window [05:00:00, 16:00:00]"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-13T14:00:01Z",
    "requestId": "req_01j7b9k5"
  }
}
```

---

## 4. Idempotency & Concurrency Control

- **Idempotency Keys**: Mutating operations (pay run execution, bulk punch uploads, manual adjustments) require an `Idempotency-Key: <uuid>` header. Repeated requests return cached identical responses.
- **Optimistic Concurrency**: Updatable resources support `If-Match: "<version_tag>"` to prevent race conditions during concurrent admin edits.

---

## 5. Pagination & Filtering

List endpoints support keyset (cursor) pagination or offset pagination:
- `limit`: Number of items per page (default: 50, maximum: 200).
- `cursor`: Opaque base64 cursor string for fast sequential pagination.
- `sort`: Comma-separated fields, prefixed with `-` for descending (e.g. `?sort=-created_at,name`).

---

## 6. Webhooks & Outbound Events

External ERP systems (e.g. SAP, Tally, Zoho) can subscribe to outbound HTTPS webhooks:
- Delivered with HMAC-SHA256 signature in `X-APMS-Signature` header.
- Automatic retry with exponential backoff on delivery failure.
- Core events: `pay_run.locked`, `attendance.finalized`, `employee.onboarded`, `device.offline`.

