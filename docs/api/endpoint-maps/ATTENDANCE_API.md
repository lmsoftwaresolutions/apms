# Attendance & Pairing Engine REST API Specification (M09 & M10)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Module Overview & Base URL

The **Attendance & Pairing Engine** represents the computational core of APMS. It manages the complete lifecycle of workforce time tracking:
- Raw punch ingestion normalization and deduplication (`BR-ING-01`, `BR-PCH-01`).
- Session-aware chronological punch pairing within shift windows (`BR-ATT-01`).
- Strict mid-shift gap non-working exclusion for split shifts (`BR-ATT-02`, `N65`).
- Overnight shift date attribution to start calendar date (`BR-ATT-03`).
- Single-punch anomaly isolation and configurable resolution (`BR-ATT-04`, `Q4`).
- Multi-day continuous duty (24h/36h/48h) handling with post-duty rest credits (`BR-ATT-15`, `Q5`).
- Daily attendance rollup calculation under `DURATION_RATIO` mode (`BR-ROL-01`, `BR-ROL-02`, `N66a`).
- Session minimum-presence eligibility evaluation (`BR-ROL-03`, `N66b`).
- Session-targeted half-day leave mapping (`BR-ROL-04`, `N66c`).
- Employer-cancelled session management (`BR-ROL-05`, `N66d`).
- Ad-hoc same-day supervisor shift overrides and dynamic shift matching (`BR-ROL-06`, `N67`).
- Immutable JSON explanation traces for every daily rollup (`BR-ATT-11`).
- Strict read-vs-write decoupling: viewing screens never mutates database state (`BR-ATT-18`, `ADR-07`).
- Period lock and next-cycle arrears routing (`BR-PAY-12`, `ADR-07`).

### Base URL
```http
/api/v1/attendance
```

### Authentication & Tenant Isolation
- **Authentication**: `Authorization: Bearer <JWT>` containing `sub` (user_id), `tid` (tenant_id), and `rol` (user_role).
- **Tenant Context**: Automatically sets PostgreSQL session variable:
  ```sql
  SET LOCAL app.current_tenant_id = '<tenant_id_uuid>';
  ```
- **Row-Level Security**: Enforced on all underlying tables (`attendance_daily_records`, `attendance_explanation_traces`, `attendance_regularization_requests`, `punch_events`).

---

## 2. Comprehensive REST Endpoint Table

| Method | Endpoint Path | Description | Required RBAC Role | Query / Body Params | Response Schema / Status | Idempotent |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/attendance/punch` | Self-service mobile/kiosk punch clock-in/out with geofence verification | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Body: `PunchClockInRequest` | `201 Created` (`PunchEventResponseEnvelope`) | Yes (Debounced 60s) |
| `POST` | `/api/v1/attendance/punches/manual` | HR/Admin manual punch insertion with audit reason code | `HR_PAYROLL`, `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `ManualPunchCreateRequest` | `201 Created` (`PunchEventResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/attendance/punches` | List normalized punch events with pagination, employee, date range, device filters | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `start_date`, `end_date`, `device_id`, `flag`, `limit`, `cursor` | `200 OK` (`PunchListEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/punches/{id}` | Retrieve individual punch event details and raw envelope link | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`PunchDetailEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/punches/unpaired` | List unpaired orphan punches awaiting shift match or regularization | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `start_date`, `end_date`, `branch_id`, `department_id`, `limit`, `cursor` | `200 OK` (`UnpairedPunchListEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/records` | Query daily attendance rollup records with multi-dimensional filtering | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `start_date`, `end_date`, `status`, `anomaly_code`, `limit`, `cursor` | `200 OK` (`DailyAttendanceListEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/records/{id}` | Get detailed daily attendance record including session pairs and rollup metrics | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`DailyAttendanceDetailEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/records/{id}/trace` | Retrieve immutable JSON explanation trace for daily calculation audit | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL`, `AUDITOR` | Path: `id` (UUID) | `200 OK` (`ExplanationTraceEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/employees/{employee_id}/monthly` | Monthly employee calendar view with daily statuses, credits, and flags | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `employee_id` (UUID), Query: `month` (`YYYY-MM`) | `200 OK` (`MonthlyCalendarEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/summary/daily` | Real-time organization/branch attendance summary dashboard metrics | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `date` (`YYYY-MM-DD`), `branch_id`, `department_id` | `200 OK` (`DailySummaryMetricsEnvelope`) | Yes |
| `POST` | `/api/v1/attendance/regularization-requests` | Employee self-service punch regularization request submission | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Body: `RegularizationCreateRequest` | `201 Created` (`RegularizationResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/attendance/regularization-requests` | List regularization requests filtered by employee, status, date range | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `status`, `start_date`, `end_date`, `limit`, `cursor` | `200 OK` (`RegularizationListEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/regularization-requests/{id}` | Get single regularization request details and workflow approval history | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`RegularizationDetailEnvelope`) | Yes |
| `POST` | `/api/v1/attendance/regularization-requests/{id}/approve` | Supervisor / HR approval of regularization request with automatic re-pairing | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `RegularizationApprovalRequest` | `200 OK` (`RegularizationResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/attendance/regularization-requests/{id}/reject` | Supervisor / HR rejection of regularization request with mandatory reason | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `RegularizationRejectRequest` | `200 OK` (`RegularizationResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `DELETE` | `/api/v1/attendance/regularization-requests/{id}` | Cancel pending regularization request by requesting employee | `EMPLOYEE` (requester only) | Path: `id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/exceptions` | Retrieve Human Exception Queue items (lone punches, clock drift, unmapped shifts) | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `date`, `anomaly_code`, `department_id`, `limit`, `cursor` | `200 OK` (`ExceptionQueueListEnvelope`) | Yes |
| `POST` | `/api/v1/attendance/exceptions/{id}/resolve` | Explicit human resolution of single exception item with audit trail | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `ExceptionResolutionRequest` | `200 OK` (`DailyAttendanceDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/attendance/exceptions/bulk-resolve` | Bulk fallback resolution of unresolved lone punches according to tenant policy | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `BulkExceptionResolveRequest` | `200 OK` (`BulkActionSummaryEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/attendance/records/{id}/override` | Admin manual override of daily attendance status and credits | `HR_PAYROLL`, `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID), Body: `AttendanceManualOverrideRequest` | `200 OK` (`DailyAttendanceDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/attendance/recalculate` | Trigger asynchronous attendance pairing and rollup re-computation | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Body: `AttendanceRecalculateRequest` | `202 Accepted` (`AsyncTaskEnqueuedEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/attendance/recalculate/status/{task_id}` | Poll background recalculation worker progress and completion report | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `task_id` (UUID) | `200 OK` (`TaskProgressEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/period-locks` | List period lock statuses across Pay Groups and branches | `HR_PAYROLL`, `TENANT_ADMIN`, `SUPER_ADMIN` | Query: `pay_group_id`, `year`, `month` | `200 OK` (`PeriodLockListEnvelope`) | Yes |
| `POST` | `/api/v1/attendance/period-locks/freeze` | Freeze attendance period for a Pay Group ahead of payroll execution | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `AttendancePeriodFreezeRequest` | `200 OK` (`PeriodLockResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/attendance/period-locks/unfreeze` | Emergency unfreeze of locked attendance period (requires Super Admin privilege) | `SUPER_ADMIN`, `TENANT_ADMIN` | Body: `AttendancePeriodUnfreezeRequest` | `200 OK` (`PeriodLockResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/attendance/reports/muster-roll` | Export statutory Form 25 Muster Roll (PDF, XLSX, CSV) compliant with Factories Act | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Query: `month` (`YYYY-MM`), `branch_id`, `format` (`pdf`\|`xlsx`\|`csv`) | `200 OK` (Binary file or S3 signed URL) | Yes |
| `GET` | `/api/v1/attendance/reports/daily-activity` | Export chronological daily punch activity log with paired sessions | `SUPERVISOR`, `HR_PAYROLL`, `AUDITOR` | Query: `date`, `branch_id`, `department_id`, `format` | `200 OK` (Binary file or S3 signed URL) | Yes |
| `GET` | `/api/v1/attendance/reports/late-coming` | Export late arrival and early departure infraction log with penalty points | `SUPERVISOR`, `HR_PAYROLL` | Query: `start_date`, `end_date`, `department_id` | `200 OK` (`LateReportEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/reports/overtime-summary` | Summary of candidate overtime hours awaiting supervisor authorization | `SUPERVISOR`, `HR_PAYROLL` | Query: `start_date`, `end_date`, `branch_id` | `200 OK` (`OvertimeSummaryEnvelope`) | Yes |
| `POST` | `/api/v1/attendance/webhooks/subscribe` | Register external outbound webhook for attendance finalization events | `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `AttendanceWebhookSubscriptionRequest` | `201 Created` (`WebhookSubscriptionEnvelope`) | Yes |
| `GET` | `/api/v1/attendance/webhooks/deliveries` | Audit outbound webhook delivery logs, HTTP statuses, and retry attempts | `TENANT_ADMIN`, `SUPER_ADMIN` | Query: `subscription_id`, `event_type`, `limit`, `cursor` | `200 OK` (`WebhookDeliveryListEnvelope`) | Yes |

---

## 3. Detailed Request & Response Schemas for Critical Endpoints

### 3.1 Mobile / Kiosk Clock-In / Clock-Out (`POST /api/v1/attendance/punch`)

#### Request Schema
```http
POST /api/v1/attendance/punch HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: 7b2c91a4-9214-4864-8f83-e184061a9951

{
  "punch_time": "2026-11-16T08:02:15Z",
  "punch_type": "IN",
  "source": "MOBILE_APP",
  "location": {
    "latitude": 19.076090,
    "longitude": 72.877426,
    "accuracy_meters": 8.5,
    "is_mock_location": false,
    "device_geofence_id": "018f3a5b-9a8c-7000-8b01-999999999999"
  },
  "device_telemetry": {
    "device_model": "Samsung SM-G998B",
    "os_version": "Android 14",
    "app_version": "2.4.1",
    "battery_percentage": 78
  },
  "biometric_verification": {
    "method": "FACE_MATCH_ON_DEVICE",
    "liveness_score": 0.985,
    "verified_on_device": true
  }
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "punch_event_id": "018f3a5b-9a8c-7000-8b01-444444444444",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "punch_time_utc": "2026-11-16T08:02:15Z",
    "punch_time_local": "2026-11-16T13:32:15+05:30",
    "source": "MOBILE_APP",
    "flag": "NORMAL",
    "pairing_status": "MATCHED",
    "matched_shift_instance_id": "018f3a5b-9a8c-7000-8b01-333333333333",
    "matched_session_index": 1,
    "geofence_status": "INSIDE_BOUNDARY",
    "received_at": "2026-11-16T08:02:16.120Z"
  },
  "meta": {
    "timestamp": "2026-11-16T08:02:16Z",
    "requestId": "req_01j7b9k4"
  }
}
```

---

### 3.2 Attendance Regularization Request (`POST /api/v1/attendance/regularization-requests`)

#### Request Schema
```http
POST /api/v1/attendance/regularization-requests HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: a3e800c1-884e-4e48-8df0-4b533cb9d012

{
  "attendance_date": "2026-11-15",
  "reason_code": "BIOMETRIC_DEVICE_OFFLINE",
  "employee_remarks": "Biometric device at Branch A Main Gate failed to recognize thumbprint. Reported to IT helpdesk ticket #4812.",
  "requested_punches": [
    {
      "session_index": 1,
      "punch_type": "IN",
      "punch_time": "2026-11-15T08:58:00+05:30"
    },
    {
      "session_index": 1,
      "punch_type": "OUT",
      "punch_time": "2026-11-15T18:05:00+05:30"
    }
  ],
  "supporting_document_url": "https://storage.apms.example.com/tenants/018f/regularizations/ticket_4812.pdf"
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "request_id": "018f3a5b-9a8c-7000-8b01-555555555555",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "attendance_date": "2026-11-15",
    "status": "PENDING",
    "reason_code": "BIOMETRIC_DEVICE_OFFLINE",
    "current_approver_id": "018f3a5b-9a8c-7000-8b01-888888888888",
    "workflow_step": 1,
    "created_at": "2026-11-16T04:15:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T04:15:01Z",
    "requestId": "req_01j7b9k6"
  }
}
```

---

### 3.3 Explanation Trace Inspection (`GET /api/v1/attendance/records/{id}/trace`)

#### Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "trace_id": "018f3a5b-9a8c-7000-8b01-666666666666",
    "version": "2.0",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "attendance_date": "2026-11-13",
    "shift_instance_id": "018f3a5b-9a8c-7000-8b01-333333333333",
    "shift_code": "SPLIT-MORN-EVE",
    "shift_type": "MULTI_SESSION",
    "is_multi_day": false,
    "sessions": [
      {
        "session_index": 1,
        "scheduled_in": "08:00:00",
        "scheduled_out": "12:00:00",
        "paired_in": "08:04:12",
        "paired_out": "12:01:05",
        "worked_minutes": 236,
        "scheduled_minutes": 240,
        "min_presence_required_minutes": 120,
        "eligibility": "COMPLETED",
        "late_minutes": 0,
        "early_exit_minutes": 0
      },
      {
        "session_index": 2,
        "scheduled_in": "16:00:00",
        "scheduled_out": "20:00:00",
        "paired_in": "16:00:00",
        "paired_out": "20:00:00",
        "worked_minutes": 240,
        "scheduled_minutes": 240,
        "min_presence_required_minutes": 120,
        "eligibility": "COMPLETED",
        "late_minutes": 0,
        "early_exit_minutes": 0
      }
    ],
    "gap_intervals": [
      {
        "start": "12:01:05",
        "end": "16:00:00",
        "duration_minutes": 238,
        "classification": "UNTRACKED_MID_SHIFT_GAP",
        "excluded_from_worked_duration": true,
        "rule_reference": "BR-ATT-02 (N65)"
      }
    ],
    "anomalies": [],
    "rollup": {
      "mode": "DURATION_RATIO",
      "total_worked_minutes": 476,
      "total_scheduled_minutes": 480,
      "coverage_ratio": 0.9917,
      "assigned_status": "PRESENT",
      "credit": 1.0,
      "status_band": "PRESENT_BAND (>= 0.90)"
    },
    "period_lock_status": "OPEN",
    "generated_at": "2026-11-13T20:15:30Z"
  },
  "meta": {
    "timestamp": "2026-11-16T10:00:00Z",
    "requestId": "req_01j7b9k7"
  }
}
```

---

### 3.4 Asynchronous Recalculation Engine (`POST /api/v1/attendance/recalculate`)

#### Request Schema
```http
POST /api/v1/attendance/recalculate HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: e82f1b40-77a8-44fa-90f1-112233445566

{
  "scope": "DEPARTMENT",
  "target_id": "018f3a5b-9a8c-7000-8b01-777777777777",
  "start_date": "2026-11-01",
  "end_date": "2026-11-15",
  "re_pair_punches": true,
  "force_override_manual": false,
  "reason": "Branch rotation schedule pattern retroactive realignment"
}
```

#### Success Response Schema (`202 Accepted`)
```json
{
  "success": true,
  "data": {
    "task_id": "018f3a5b-9a8c-7000-8b01-aaaaaaaaaaaa",
    "status": "ENQUEUED",
    "enqueued_at": "2026-11-16T10:05:00Z",
    "estimated_employee_count": 142,
    "status_polling_url": "/api/v1/attendance/recalculate/status/018f3a5b-9a8c-7000-8b01-aaaaaaaaaaaa"
  },
  "meta": {
    "timestamp": "2026-11-16T10:05:01Z",
    "requestId": "req_01j7b9k8"
  }
}
```

---

## 4. Module-Specific Error Responses (RFC 7807)

### 4.1 409 Conflict: Punch Within Debounce Window (`BR-PCH-01`)
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_PUNCH_DEBOUNCED",
    "message": "A punch for this employee was already recorded within the last 60 seconds.",
    "details": [
      {
        "field": "punch_time",
        "issue": "Previous punch recorded at 2026-11-16T08:02:05Z (10s elapsed; debounce threshold is 60s)"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T08:02:15Z",
    "requestId": "req_01j7b9k9"
  }
}
```

### 4.2 422 Unprocessable Entity: Punch Outside Allowable Ingestion Window
```json
{
  "success": false,
  "error": {
    "code": "INGESTION_WINDOW_OUT_OF_BOUNDS",
    "message": "Punch timestamp falls outside scheduled session pre/post tolerance bounds.",
    "details": [
      {
        "field": "punch_time",
        "issue": "Timestamp 2026-11-16T04:30:00Z is earlier than session 1 pre-window threshold 07:00:00"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T04:30:01Z",
    "requestId": "req_01j7b9l0"
  }
}
```

### 4.3 400 Bad Request: Mutation Forbidden on Locked Period (`BR-PAY-12`)
```json
{
  "success": false,
  "error": {
    "code": "ATTENDANCE_PERIOD_LOCKED",
    "message": "Cannot modify or regularize attendance records in a period that has been finalized and locked for payroll.",
    "details": [
      {
        "field": "attendance_date",
        "issue": "Period October 2026 was locked on 2026-11-01T18:00:00Z. Retroactive corrections must be processed as next-cycle Arrears."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T11:00:00Z",
    "requestId": "req_01j7b9l1"
  }
}
```
