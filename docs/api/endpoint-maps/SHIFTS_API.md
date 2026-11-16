# Shifts & Rostering Engine REST API Specification (M07 & M08)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Module Overview & Base URL

The **Shifts & Rostering Engine** governs workforce scheduling, recurring rotation patterns, dynamic shift matching pools, and concrete dated shift instance generation for APMS.

Key Architectural Invariants:
- **Comprehensive Shift Classification (`SHF-01` to `SHF-06`)**:
  - `FIXED_STANDARD`: Configurable start/end, arrival/exit grace, and break parameters (`SHF-01`).
  - `OVERNIGHT`: Shifts spanning midnight with unambiguous boundary date attribution to shift start day (`SHF-02`).
  - `MULTI_SESSION`: Split shifts with 2+ scheduled sessions and mandatory N65 mid-gap non-working exclusion (`SHF-03`).
  - `FLEXIBLE_WINDOW`: Core presence hours combined with flexible duration requirements (`SHF-04`).
  - `CONTINUOUS_MULTI_DAY`: Multi-day duty (24h/36h/48h) in healthcare/plants anchored to start date (`SHF-05`).
  - `DYNAMIC_POOL`: Automated shift auto-detection from punch timestamps without manual daily rostering (`SHF-06`).
- **Materialized Shift Instances (`ROS-03`, `ADR-15`)**: Recurring patterns are materialized into concrete rows in `dated_shift_instance` $N$ days in advance. Attendance calculates strictly against dated instances.
- **Dual-Path Same-Day Schedule Changes (`N67`, `BR-ROL-06`)**:
  - *Path 1 (Supervisor Direct Override)*: Supervisor modifies dated instance directly via `/instances/{id}/override`.
  - *Path 2 (Employee Request)*: Employee requests shift change via `/requests/adhoc-change`, requiring supervisor approval.
  - Both paths publish a Redis `shift.modified` event triggering immediate punch un-pairing and recalculation.
- **Employer-Cancelled Sessions (`ROS-10`, `N66d`, `BR-ROL-05`)**: Management session cancellations marked `CANCELLED_PAID`.
- **Peer-to-Peer Shift Swaps (`ROS-05`)**: Two-step workflow requiring peer mutual consent and supervisor authorization.

### Base URL
```http
/api/v1/shifts
```

### Authentication & Tenant Isolation
- **Authentication**: `Authorization: Bearer <JWT>` containing `sub` (user_id), `tid` (tenant_id), and `rol` (user_role).
- **Tenant Context**: Enforced through PostgreSQL session context:
  ```sql
  SET LOCAL app.current_tenant_id = '<tenant_id_uuid>';
  ```
- **Row-Level Security**: Enabled and forced on `shift_templates`, `shift_pools`, `roster_patterns`, `dated_shift_instances`.

---

## 2. Comprehensive REST Endpoint Table

| Method | Endpoint Path | Description | Required RBAC Role | Query / Body Params | Response Schema / Status | Idempotent |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/shifts/templates` | List shift templates with type, status, and department filters | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Query: `shift_type`, `is_active`, `limit`, `cursor` | `200 OK` (`ShiftTemplateListEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/templates` | Create a reusable shift template with session timings and grace bands | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `ShiftTemplateCreateRequest` | `201 Created` (`ShiftTemplateDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/templates/{id}` | Retrieve individual shift template configuration and session definitions | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`ShiftTemplateDetailEnvelope`) | Yes |
| `PUT` | `/api/v1/shifts/templates/{id}` | Update shift template rules (does not retroactively mutate past instances) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `ShiftTemplateUpdateRequest` | `200 OK` (`ShiftTemplateDetailEnvelope`) | Yes (`If-Match`) |
| `DELETE` | `/api/v1/shifts/templates/{id}` | Soft delete / archive shift template | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `GET` | `/api/v1/shifts/pools` | List dynamic candidate shift pools for auto-matching (`SHF-06`) | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `branch_id`, `limit`, `cursor` | `200 OK` (`ShiftPoolListEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/pools` | Create dynamic shift pool with candidate shifts and matching tolerances | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `ShiftPoolCreateRequest` | `201 Created` (`ShiftPoolDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/pools/{id}` | Get shift pool details, candidate shifts, and auto-match strategies | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`ShiftPoolDetailEnvelope`) | Yes |
| `PUT` | `/api/v1/shifts/pools/{id}` | Update candidate shift list or matching criteria in pool | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `ShiftPoolUpdateRequest` | `200 OK` (`ShiftPoolDetailEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/pools/assign` | Assign employees or departments to a dynamic shift pool | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Body: `ShiftPoolAssignRequest` | `200 OK` (`ActionSuccessEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/patterns` | List recurring roster patterns (e.g. 6-1, cyclical 3-shift rotation) | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `is_active`, `limit`, `cursor` | `200 OK` (`RosterPatternListEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/patterns` | Create recurring rotation pattern with cycle length and day mapping | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `RosterPatternCreateRequest` | `201 Created` (`RosterPatternDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/patterns/{id}` | Get roster pattern structure and cycle schedule mapping | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`RosterPatternDetailEnvelope`) | Yes |
| `PUT` | `/api/v1/shifts/patterns/{id}` | Update rotation pattern sequence | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `RosterPatternUpdateRequest` | `200 OK` (`RosterPatternDetailEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/patterns/assign` | Assign roster pattern to employees with start date and initial cycle offset | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Body: `RosterPatternAssignRequest` | `200 OK` (`ActionSuccessEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/materialize` | Trigger advance batch materialization of dated shift instances (`ROS-03`) | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `ShiftMaterializationRequest` | `202 Accepted` (`AsyncTaskEnqueuedEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/materialize/status/{task_id}` | Check status and progress of roster materialization background worker | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `task_id` (UUID) | `200 OK` (`TaskProgressEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/materialize/preview` | Preview upcoming shift instances for validation prior to materializing | `SUPERVISOR`, `HR_PAYROLL` | Body: `MaterializationPreviewRequest` | `200 OK` (`MaterializationPreviewEnvelope`) | Yes |
| `GET` | `/api/v1/shifts/instances` | List dated shift instances with multi-criteria filtering | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `start_date`, `end_date`, `department_id`, `limit`, `cursor` | `200 OK` (`ShiftInstanceListEnvelope`) | Yes |
| `GET` | `/api/v1/shifts/instances/{id}` | Retrieve individual dated shift instance and session schedules | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`ShiftInstanceDetailEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/instances/{id}/override` | **Path 1**: Direct supervisor ad-hoc override of dated shift instance (`N67`) | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `SupervisorShiftOverrideRequest` | `200 OK` (`ShiftInstanceDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/instances/bulk-override` | Bulk supervisor override of shift instances for a crew or team date | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Body: `BulkShiftOverrideRequest` | `200 OK` (`BulkActionSummaryEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/instances/{id}/cancel-session` | Mark session as employer-cancelled `CANCELLED_PAID` (`N66d`, `ROS-10`) | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `CancelSessionRequest` | `200 OK` (`ShiftInstanceDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/requests/adhoc-change` | **Path 2**: Employee submits same-day shift modification request (`N67`) | `EMPLOYEE`, `SUPERVISOR` | Body: `AdhocShiftChangeCreateRequest` | `201 Created` (`AdhocShiftChangeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/requests/adhoc-change` | List employee ad-hoc shift change requests with workflow statuses | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `status`, `start_date`, `end_date`, `limit` | `200 OK` (`AdhocShiftChangeListEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/requests/adhoc-change/{id}/approve` | Supervisor approves ad-hoc shift change request, updating dated instance | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `ApprovalDecisionRequest` | `200 OK` (`AdhocShiftChangeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/requests/adhoc-change/{id}/reject` | Supervisor rejects ad-hoc shift change request | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `RejectionDecisionRequest` | `200 OK` (`AdhocShiftChangeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/swaps` | Submit peer-to-peer shift swap application between two employees (`ROS-05`) | `EMPLOYEE` | Body: `ShiftSwapCreateRequest` | `201 Created` (`ShiftSwapDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/swaps` | List shift swap requests involving requesting employee or supervisor team | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `status`, `date`, `limit`, `cursor` | `200 OK` (`ShiftSwapListEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/swaps/{id}/peer-consent` | Peer employee grants mutual consent or declines proposed shift swap | `EMPLOYEE` (target peer) | Path: `id` (UUID), Body: `PeerConsentRequest` | `200 OK` (`ShiftSwapDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/swaps/{id}/approve` | Supervisor final approval of mutually consented shift swap | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `ApprovalDecisionRequest` | `200 OK` (`ShiftSwapDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/swaps/{id}/reject` | Supervisor rejection of shift swap | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `RejectionDecisionRequest` | `200 OK` (`ShiftSwapDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/shifts/roster/grid` | Query team roster matrix grid view for visualization and scheduling | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `start_date`, `end_date`, `department_id`, `branch_id` | `200 OK` (`RosterMatrixGridEnvelope`) | Yes |
| `GET` | `/api/v1/shifts/roster/coverage` | Check roster staffing coverage vs department minimum headcount targets | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `date`, `department_id`, `shift_template_id` | `200 OK` (`ShiftCoverageReportEnvelope`) | Yes |
| `GET` | `/api/v1/shifts/roster/unassigned` | List open unassigned / relief shift slots available for claim (`ROS-06`) | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Query: `branch_id`, `date`, `limit` | `200 OK` (`OpenShiftListEnvelope`) | Yes |
| `POST` | `/api/v1/shifts/roster/unassigned/{id}/claim` | Staff member claims open unassigned relief shift | `EMPLOYEE` | Path: `id` (UUID), Body: `ClaimShiftRequest` | `200 OK` (`ShiftInstanceDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/shifts/webhooks/subscribe` | Register outbound webhook for `shift.modified` or `roster.materialized` | `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `ShiftWebhookSubscriptionRequest` | `201 Created` (`WebhookSubscriptionEnvelope`) | Yes |

---

## 3. Detailed Request & Response Schemas for Critical Endpoints

### 3.1 Create Split Shift Template with N65 Gap (`POST /api/v1/shifts/templates`)

#### Request Schema
```http
POST /api/v1/shifts/templates HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: c94b2817-48f1-4328-98e1-584739102482

{
  "code": "SPLIT-MORN-EVE",
  "name": "Restaurant Split Shift (Morning & Evening)",
  "shift_type": "MULTI_SESSION",
  "branch_id": "018f3a5b-9a8c-7000-8b01-222222222222",
  "sessions": [
    {
      "session_index": 1,
      "name": "Lunch Service",
      "start_time": "08:00:00",
      "end_time": "12:00:00",
      "scheduled_duration_minutes": 240,
      "min_presence_ratio": 0.50,
      "grace_arrival_minutes": 15,
      "grace_exit_minutes": 10,
      "pre_window_minutes": 60,
      "post_window_minutes": 60
    },
    {
      "session_index": 2,
      "name": "Dinner Service",
      "start_time": "16:00:00",
      "end_time": "20:00:00",
      "scheduled_duration_minutes": 240,
      "min_presence_ratio": 0.50,
      "grace_arrival_minutes": 15,
      "grace_exit_minutes": 10,
      "pre_window_minutes": 60,
      "post_window_minutes": 60
    }
  ],
  "gap_rules": {
    "treat_gap_as_non_working": true,
    "require_boundary_punches": true,
    "rule_reference": "N65"
  },
  "rollup_policy": {
    "mode": "DURATION_RATIO",
    "present_threshold_ratio": 0.90,
    "half_day_threshold_ratio": 0.50,
    "cap_at_half_day_if_session_below_min": true
  }
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "id": "018f3a5b-9a8c-7000-8b01-333333333333",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "code": "SPLIT-MORN-EVE",
    "name": "Restaurant Split Shift (Morning & Evening)",
    "shift_type": "MULTI_SESSION",
    "total_scheduled_minutes": 480,
    "session_count": 2,
    "is_active": true,
    "created_at": "2026-11-16T09:00:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T09:00:01Z",
    "requestId": "req_01j7b9n1"
  }
}
```

---

### 3.2 Supervisor Ad-Hoc Shift Override — N67 Path 1 (`POST /api/v1/shifts/instances/{id}/override`)

#### Request Schema
```http
POST /api/v1/shifts/instances/018f3a5b-9a8c-7000-8b01-444444444444/override HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: a11874b3-2199-4d44-a021-934812bca012

{
  "target_shift_template_id": "018f3a5b-9a8c-7000-8b01-555555555555",
  "reason": "CRITICAL_MACHINE_BREAKDOWN",
  "supervisor_remarks": "Reassigned to Night Maintenance Shift (22:00-06:00) to support hydraulic press overhaul.",
  "trigger_attendance_recalculation": true
}
```

#### Success Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "018f3a5b-9a8c-7000-8b01-444444444444",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "shift_date": "2026-11-16",
    "previous_template_id": "018f3a5b-9a8c-7000-8b01-333333333333",
    "new_template_id": "018f3a5b-9a8c-7000-8b01-555555555555",
    "resolution_mode": "SUPERVISOR_OVERRIDE",
    "is_adhoc_modified": true,
    "modification_reason": "CRITICAL_MACHINE_BREAKDOWN",
    "modified_by_user_id": "018f3a5b-9a8c-7000-8b01-999999999999",
    "recalculation_enqueued": true,
    "updated_at": "2026-11-16T11:20:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T11:20:01Z",
    "requestId": "req_01j7b9n2"
  }
}
```

---

### 3.3 Advance Batch Materialization (`POST /api/v1/shifts/materialize`)

#### Request Schema
```http
POST /api/v1/shifts/materialize HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: f9281a4b-0193-4a12-88ef-938210349182

{
  "scope": "ALL_ACTIVE_EMPLOYEES",
  "start_date": "2026-12-01",
  "end_date": "2026-12-31",
  "overwrite_unmodified_instances": false,
  "preserve_adhoc_overrides": true
}
```

#### Success Response Schema (`202 Accepted`)
```json
{
  "success": true,
  "data": {
    "task_id": "018f3a5b-9a8c-7000-8b01-eeeeeeeeeeee",
    "status": "ENQUEUED",
    "start_date": "2026-12-01",
    "end_date": "2026-12-31",
    "target_employee_count": 850,
    "estimated_instances_to_create": 26350,
    "status_url": "/api/v1/shifts/materialize/status/018f3a5b-9a8c-7000-8b01-eeeeeeeeeeee"
  },
  "meta": {
    "timestamp": "2026-11-16T12:00:00Z",
    "requestId": "req_01j7b9n3"
  }
}
```

---

### 3.4 Peer-to-Peer Shift Swap Application (`POST /api/v1/shifts/swaps`)

#### Request Schema
```http
POST /api/v1/shifts/swaps HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: eb472109-77a8-44fa-90f1-482910482019

{
  "requesting_employee_date": "2026-11-20",
  "target_employee_id": "018f3a5b-9a8c-7000-8b01-777777777777",
  "target_employee_date": "2026-11-21",
  "reason": "Personal family emergency on Saturday; agreeing to cover Friday shift in exchange.",
  "requested_by_employee_id": "018f3a5b-9a8c-7000-8b01-222222222222"
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "swap_request_id": "018f3a5b-9a8c-7000-8b01-ffffffffffff",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "requesting_employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "requesting_date": "2026-11-20",
    "target_employee_id": "018f3a5b-9a8c-7000-8b01-777777777777",
    "target_date": "2026-11-21",
    "peer_consent_status": "PENDING_CONSENT",
    "supervisor_approval_status": "AWAITING_PEER_CONSENT",
    "created_at": "2026-11-16T13:00:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T13:00:01Z",
    "requestId": "req_01j7b9n4"
  }
}
```

---

## 4. Module-Specific Error Responses (RFC 7807)

### 4.1 409 Conflict: Overlapping Shift Assignment (`SHF-01`)
```json
{
  "success": false,
  "error": {
    "code": "OVERLAPPING_SHIFT_SCHEDULE",
    "message": "Cannot assign shift instance because employee already has an active overlapping shift schedule.",
    "details": [
      {
        "field": "shift_date",
        "issue": "Employee 018f3a5b-9a8c-7000-8b01-222222222222 has Overnight Shift (22:00-06:00) ending on 2026-11-16T06:00:00Z. Cannot assign Morning Shift starting at 06:00:00Z without statutory rest interval."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T13:30:00Z",
    "requestId": "req_01j7b9n5"
  }
}
```

### 4.2 422 Unprocessable Entity: Statutory Rest Period Violation (`ROS-02`)
```json
{
  "success": false,
  "error": {
    "code": "STATUTORY_REST_INTERVAL_VIOLATION",
    "message": "Schedule modification violates mandatory statutory rest interval between shifts under Factories Act.",
    "details": [
      {
        "field": "target_shift_template_id",
        "issue": "Continuous 24/7 rest policy requires minimum 16 hours turnaround between duties. Proposed shift provides only 8 hours rest."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T13:35:00Z",
    "requestId": "req_01j7b9n6"
  }
}
```
