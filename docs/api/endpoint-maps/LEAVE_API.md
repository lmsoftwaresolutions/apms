# Leave & Holiday Management REST API Specification (M11)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Module Overview & Base URL

The **Leave & Holiday Management Engine** governs employee time-off, statutory leave entitlements, branch holiday calendars, and policy engines across APMS.

Key Architectural Invariants:
- **Append-Only Double-Entry Leave Ledger (`ADR-08`, `LVE-01`)**:
  - Balances are never stored as mutable scalar numbers in employee records.
  - Every mutation is an immutable transaction record in `leave_transactions`.
  - Transaction types: `ACCRUAL` (credit), `APPLICATION` (debit), `CANCELLATION` (credit reversal), `ENCASHMENT` (debit for payroll cash payout), `LAPSE` (debit at year-end), `MANUAL_ADJUSTMENT` (HR audit correction).
  - Current balance is calculated dynamically:
    $$\text{Balance} = \sum_{\text{Credits}} \text{days} - \sum_{\text{Debits}} \text{days}$$
- **Session-Targeted Half-Day Leave (`N66c`, `BR-ROL-04`)**:
  - Half-day applications explicitly specify session target: `FIRST_HALF` or `SECOND_HALF`.
  - Waives attendance requirement for the target session (0.5 leave credit); the non-targeted session must be worked. If worked successfully, status becomes `PRESENT` (0.5 worked + 0.5 leave = 1.0 total daily credit).
- **Work-From-Home (WFH) Auto-Approval Quota (`Q6`, `BR-WFH-01`, `WFL-02`)**:
  - Tenants configure a monthly WFH quota (e.g. 4 days/month).
  - Applications within quota balance transition automatically to `AUTO_APPROVED` without blocking on manager review.
- **Sandwich Rule Engine (`BR-LVE-02`, `LVE-04`)**:
  - Automatically evaluates whether holidays or weekly offs flanked by unapproved absences or leaves are converted to Leave or Loss of Pay (LOP).
- **Negative Balance Locking (`BR-LVE-03`, `LVE-06`)**:
  - Rejects applications if $\text{Balance} - \text{Requested} < 0$ unless `allow_negative_balance` is enabled on the leave type. Otherwise falls back to `LOSS_OF_PAY`.

### Base URL
```http
/api/v1/leaves
```

### Authentication & Tenant Isolation
- **Authentication**: `Authorization: Bearer <JWT>` containing `sub` (user_id), `tid` (tenant_id), and `rol` (user_role).
- **Tenant Context**: Enforced through PostgreSQL session context:
  ```sql
  SET LOCAL app.current_tenant_id = '<tenant_id_uuid>';
  ```
- **Row-Level Security**: Enabled and forced on `leave_types`, `leave_requests`, `leave_transactions`, `holiday_calendars`, `holiday_entries`.

---

## 2. Comprehensive REST Endpoint Table

| Method | Endpoint Path | Description | Required RBAC Role | Query / Body Params | Response Schema / Status | Idempotent |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/leaves/types` | List all configured leave types (Casual, Sick, Earned, Maternity, Comp-Off) | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Query: `is_active`, `limit`, `cursor` | `200 OK` (`LeaveTypeListEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/types` | Create a new leave type with carry-forward, sandwich, and negative balance rules | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `LeaveTypeCreateRequest` | `201 Created` (`LeaveTypeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/leaves/types/{id}` | Retrieve leave type configuration rules and entitlement formulas | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`LeaveTypeDetailEnvelope`) | Yes |
| `PUT` | `/api/v1/leaves/types/{id}` | Update leave type policies (accrual rates, carry-forward caps, sandwich rules) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `LeaveTypeUpdateRequest` | `200 OK` (`LeaveTypeDetailEnvelope`) | Yes (`If-Match`) |
| `DELETE` | `/api/v1/leaves/types/{id}` | Archive / deactivate leave type | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `GET` | `/api/v1/leaves/balances` | Query derived leave balances across employees via double-entry summation | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `department_id`, `leave_type_id`, `limit`, `cursor` | `200 OK` (`LeaveBalanceListEnvelope`) | Yes |
| `GET` | `/api/v1/leaves/balances/{employee_id}` | Retrieve comprehensive balance card and running totals for an employee | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `employee_id` (UUID) | `200 OK` (`EmployeeBalanceCardEnvelope`) | Yes |
| `GET` | `/api/v1/leaves/transactions` | Query append-only double-entry transaction ledger with audit trail | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL`, `AUDITOR` | Query: `employee_id`, `leave_type_id`, `transaction_type`, `start_date`, `limit` | `200 OK` (`LeaveTransactionListEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/adjustments` | HR manual adjustment: append audit debit/credit row to `leave_transactions` | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `LeaveAdjustmentCreateRequest` | `201 Created` (`LeaveAdjustmentDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/accruals/run` | Execute periodic monthly / annual automated accrual engine batch | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `AccrualRunRequest` | `202 Accepted` (`AsyncTaskEnqueuedEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/leaves/accruals/history` | List historical automated accrual execution logs and credit summaries | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Query: `year`, `month`, `limit` | `200 OK` (`AccrualHistoryListEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/accruals/preview` | Preview upcoming periodic accrual credit calculations without committing | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `AccrualPreviewRequest` | `200 OK` (`AccrualPreviewEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/applications` | Submit leave application (Full-Day, Multi-Day, or Session-Targeted Half-Day `N66c`) | `EMPLOYEE`, `SUPERVISOR` | Body: `LeaveApplicationCreateRequest` | `201 Created` (`LeaveRequestDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/leaves/applications` | List leave applications with multi-filter query support | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `status`, `leave_type_id`, `start_date`, `end_date`, `limit` | `200 OK` (`LeaveRequestListEnvelope`) | Yes |
| `GET` | `/api/v1/leaves/applications/{id}` | Get leave application details, session target breakdown, and approval trail | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`LeaveRequestDetailEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/applications/{id}/approve` | Manager approves leave request (appends `APPLICATION` debit row to ledger) | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `LeaveApprovalRequest` | `200 OK` (`LeaveRequestDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/applications/{id}/reject` | Manager rejects leave request with mandatory rejection reason | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `LeaveRejectionRequest` | `200 OK` (`LeaveRequestDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/applications/{id}/cancel` | Cancel approved leave request (appends `CANCELLATION` credit reversal row) | `EMPLOYEE` (requester), `HR_PAYROLL` | Path: `id` (UUID), Body: `LeaveCancellationRequest` | `200 OK` (`LeaveRequestDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/wfh-requests` | Submit Work-From-Home application with automatic quota verification (`Q6`) | `EMPLOYEE`, `SUPERVISOR` | Body: `WFHRequestCreateRequest` | `201 Created` (`WFHRequestDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/leaves/wfh-quota/{employee_id}` | Check remaining monthly WFH quota balance and utilization count | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Path: `employee_id` (UUID), Query: `month` (`YYYY-MM`) | `200 OK` (`WFHQuotaStatusEnvelope`) | Yes |
| `GET` | `/api/v1/leaves/wfh-requests` | List WFH applications with approval status (`AUTO_APPROVED` vs `PENDING`) | `EMPLOYEE` (self), `SUPERVISOR`, `HR_PAYROLL` | Query: `employee_id`, `status`, `month`, `limit` | `200 OK` (`WFHRequestListEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/sandwich-rule/simulate` | Dry-run sandwich rule evaluation for a payroll cut-off window | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `SandwichSimulateRequest` | `200 OK` (`SandwichSimulationResultEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/sandwich-rule/commit` | Apply sandwich rule conversions to intervening weekly offs and holidays | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `SandwichCommitRequest` | `200 OK` (`SandwichCommitResultEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/year-end/lapse` | Execute annual lapse batch for non-carry-forward leave balances (`LVE-05`) | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `YearEndLapseRequest` | `202 Accepted` (`AsyncTaskEnqueuedEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/encashment/requests` | Submit leave encashment request for payroll cash payout | `EMPLOYEE`, `HR_PAYROLL` | Body: `EncashmentCreateRequest` | `201 Created` (`EncashmentDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/leaves/encashment/{id}/approve` | HR approval of leave encashment request (appends `ENCASHMENT` debit row) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `EncashmentApprovalRequest` | `200 OK` (`EncashmentDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/leaves/holiday-calendars` | List branch-specific holiday calendars (`HOL-01`, `ORG-02`) | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Query: `branch_id`, `year` | `200 OK` (`HolidayCalendarListEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/holiday-calendars` | Create branch holiday calendar master | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `HolidayCalendarCreateRequest` | `201 Created` (`HolidayCalendarDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/leaves/holiday-calendars/{id}` | Get holiday calendar details and full list of holiday dates | `EMPLOYEE`, `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID) | `200 OK` (`HolidayCalendarDetailEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/holiday-calendars/{id}/entries` | Add individual holiday date entry (Mandatory vs Restricted/Optional) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `HolidayEntryCreateRequest` | `201 Created` (`HolidayEntryDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `PUT` | `/api/v1/leaves/holiday-calendars/{id}/entries/{entry_id}` | Update holiday date or description | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), `entry_id` (UUID), Body: `HolidayEntryUpdateRequest` | `200 OK` (`HolidayEntryDetailEnvelope`) | Yes |
| `DELETE` | `/api/v1/leaves/holiday-calendars/{id}/entries/{entry_id}` | Remove holiday entry from calendar | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), `entry_id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `GET` | `/api/v1/leaves/holidays/upcoming` | Query upcoming holidays for employee's assigned branch | `EMPLOYEE`, `SUPERVISOR` | Query: `branch_id`, `days_ahead` (default: 30) | `200 OK` (`UpcomingHolidaysEnvelope`) | Yes |
| `POST` | `/api/v1/leaves/webhooks/subscribe` | Register outbound webhook for `leave.approved`, `wfh.auto_approved` | `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `LeaveWebhookSubscriptionRequest` | `201 Created` (`WebhookSubscriptionEnvelope`) | Yes |

---

## 3. Detailed Request & Response Schemas for Critical Endpoints

### 3.1 Submit Session-Targeted Half-Day Leave (`POST /api/v1/leaves/applications`)

#### Request Schema
```http
POST /api/v1/leaves/applications HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: f14b2819-22a4-4e12-9c92-381024729184

{
  "leave_type_id": "018f3a5b-9a8c-7000-8b01-333333333333",
  "start_date": "2026-11-18",
  "end_date": "2026-11-18",
  "is_half_day": true,
  "session_target": "SECOND_HALF",
  "reason": "Personal medical appointment in the afternoon.",
  "emergency_contact": "+91 98765 43210",
  "rule_reference": "N66c (BR-ROL-04)"
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "application_id": "018f3a5b-9a8c-7000-8b01-777777777777",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "leave_type_code": "CL",
    "leave_type_name": "Casual Leave",
    "start_date": "2026-11-18",
    "end_date": "2026-11-18",
    "applied_days": 0.5,
    "is_half_day": true,
    "session_target": "SECOND_HALF",
    "status": "PENDING",
    "current_approver_id": "018f3a5b-9a8c-7000-8b01-888888888888",
    "current_balance_before_deduction": 4.5,
    "projected_balance_after_approval": 4.0,
    "created_at": "2026-11-16T14:00:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T14:00:01Z",
    "requestId": "req_01j7b9p1"
  }
}
```

---

### 3.2 Submit WFH Request with Auto-Approval (`POST /api/v1/leaves/wfh-requests`)

#### Request Schema
```http
POST /api/v1/leaves/wfh-requests HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: a882194b-9122-48f1-9b90-192847291038

{
  "date": "2026-11-19",
  "work_deliverables": "Completing architectural review of APMS API endpoint maps and documentation sync.",
  "contact_number": "+91 98765 11223"
}
```

#### Success Response Schema (`201 Created` — Auto-Approved via Q6)
```json
{
  "success": true,
  "data": {
    "wfh_request_id": "018f3a5b-9a8c-7000-8b01-aaaaaaaaaaaa",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "date": "2026-11-19",
    "status": "AUTO_APPROVED",
    "auto_approval_details": {
      "quota_rule": "Q6 (BR-WFH-01)",
      "monthly_quota": 4,
      "utilized_before_request": 2,
      "remaining_after_request": 1,
      "auto_approved_at": "2026-11-16T14:10:00Z"
    },
    "attendance_calendar_updated": true
  },
  "meta": {
    "timestamp": "2026-11-16T14:10:01Z",
    "requestId": "req_01j7b9p2"
  }
}
```

---

### 3.3 Manual Double-Entry Balance Adjustment (`POST /api/v1/leaves/adjustments`)

#### Request Schema
```http
POST /api/v1/leaves/adjustments HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: e4192b01-884c-47a2-bb01-912481029481

{
  "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
  "leave_type_id": "018f3a5b-9a8c-7000-8b01-333333333333",
  "days": 1.5,
  "transaction_type": "MANUAL_ADJUSTMENT",
  "reason_code": "PROBATION_COMPLETION_CREDIT",
  "audit_remarks": "Credit awarded for successful probation completion as per HR policy clause 4.2."
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "transaction_id": "018f3a5b-9a8c-7000-8b01-bbbbbbbbbbbb",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "leave_type_id": "018f3a5b-9a8c-7000-8b01-333333333333",
    "transaction_type": "MANUAL_ADJUSTMENT",
    "days": 1.5,
    "balance_prior": 4.0,
    "balance_after": 5.5,
    "created_by_user_id": "018f3a5b-9a8c-7000-8b01-999999999999",
    "created_at": "2026-11-16T14:20:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T14:20:01Z",
    "requestId": "req_01j7b9p3"
  }
}
```

---

### 3.4 Dry-Run Sandwich Rule Simulation (`POST /api/v1/leaves/sandwich-rule/simulate`)

#### Request Schema
```http
POST /api/v1/leaves/sandwich-rule/simulate HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json

{
  "pay_group_id": "018f3a5b-9a8c-7000-8b01-555555555555",
  "period_start_date": "2026-11-01",
  "period_end_date": "2026-11-30"
}
```

#### Success Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "simulation_timestamp": "2026-11-16T14:25:00Z",
    "pay_group_id": "018f3a5b-9a8c-7000-8b01-555555555555",
    "flanked_events_detected": 3,
    "affected_employees": [
      {
        "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
        "employee_code": "EMP-0042",
        "preceding_workday": { "date": "2026-11-07", "status": "ABSENT" },
        "weekly_off_dates": ["2026-11-08"],
        "succeeding_workday": { "date": "2026-11-09", "status": "ABSENT" },
        "sandwich_penalty": {
          "action": "CONVERT_TO_LOSS_OF_PAY",
          "converted_dates": ["2026-11-08"],
          "lop_days_added": 1.0
        }
      }
    ],
    "total_lop_days_impact": 3.0
  },
  "meta": {
    "timestamp": "2026-11-16T14:25:02Z",
    "requestId": "req_01j7b9p4"
  }
}
```

---

## 4. Module-Specific Error Responses (RFC 7807)

### 4.1 422 Unprocessable Entity: Insufficient Balance / Negative Balance Forbidden (`BR-LVE-03`)
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_LEAVE_BALANCE",
    "message": "Cannot apply for leave: requested days exceed available double-entry balance.",
    "details": [
      {
        "field": "applied_days",
        "issue": "Requested 3.0 days of Casual Leave (CL), but available ledger balance is only 1.5 days. Negative balance is disabled for this leave type."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T14:30:00Z",
    "requestId": "req_01j7b9p5"
  }
}
```

### 4.2 409 Conflict: Overlapping Leave Application
```json
{
  "success": false,
  "error": {
    "code": "OVERLAPPING_LEAVE_APPLICATION",
    "message": "An approved or pending leave application already exists for the requested dates.",
    "details": [
      {
        "field": "start_date",
        "issue": "Date 2026-11-18 conflicts with existing approved Sick Leave application (ID: 018f3a5b-9a8c-7000-8b01-666666666666)"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T14:35:00Z",
    "requestId": "req_01j7b9p6"
  }
}
```
