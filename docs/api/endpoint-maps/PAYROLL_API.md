# Payroll & Statutory Engine REST API Specification (M14 & M15)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Module Overview & Base URL

The **Payroll & Statutory Engine** governs compensation computation, statutory compliance deductions, bank disbursement processing, and server-side cryptographic PDF payslip delivery for APMS.

Key Architectural Invariants:
- **Decoupled Architecture (`ADR-07`)**: Attendance ledgers and approved leave transactions act as read-only inputs. Payroll never modifies punches or daily rollups.
- **Guided 10-Step Wizard (`ADR-09`, `PAY-01`)**: Strict finite-state machine governing the pay cycle from Step 0 (Group & Period selection) to Step 10 (PDF Publishing).
- **Statutory Parameterization (`ADR-25`, `BR-STA-01`–`05`)**: EPF ceilings (₹15,000), ESI thresholds (₹21,000), state PT slabs, and TDS regimes reside in versioned database tables, never hardcoded in source code.
- **Immutable Post-Lock Snapshot (`ADR-26`, `PAY-06`, `PSL-03`)**: Step 8 permanently freezes pay calculations into `pay_run_employee_snapshots`. Historical payslips are rendered directly from snapshots.
- **Retrospective Arrears Engine (`BR-PAY-12`)**: Backdated salary adjustments, tardy regularization, or retro increments never alter historical closed runs; they settle as delta line items in the next open pay run.
- **Bank & Accounting Integration (`INT-01`, `PSL-02`)**: Native generation of Tally Prime XML journal vouchers and bank-specific NEFT/RTGS CSV payment batches.

### Base URL
```http
/api/v1/payroll
```

### Authentication & Tenant Isolation
- **Authentication**: `Authorization: Bearer <JWT>` containing `sub` (user_id), `tid` (tenant_id), and `rol` (user_role).
- **Tenant Context**: Enforced through PostgreSQL session context:
  ```sql
  SET LOCAL app.current_tenant_id = '<tenant_id_uuid>';
  ```
- **Row-Level Security**: Enabled and forced on `pay_runs`, `pay_run_employee_snapshots`, `salary_structures`, `employee_salary_assignments`, `overtime_requests`.

---

## 2. Comprehensive REST Endpoint Table

| Method | Endpoint Path | Description | Required RBAC Role | Query / Body Params | Response Schema / Status | Idempotent |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/payroll/pay-groups` | List all configured pay groups with cut-off dates and cycle settings | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `status`, `limit`, `cursor` | `200 OK` (`PayGroupListEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/pay-groups` | Create new pay group with specific pay period cut-off schedule | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `PayGroupCreateRequest` | `201 Created` (`PayGroupDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/payroll/pay-groups/{id}` | Get pay group configuration and assigned employee count | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`PayGroupDetailEnvelope`) | Yes |
| `PUT` | `/api/v1/payroll/pay-groups/{id}` | Update pay group settings (cut-off day, disbursement day, currency) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `PayGroupUpdateRequest` | `200 OK` (`PayGroupDetailEnvelope`) | Yes |
| `GET` | `/api/v1/payroll/salary-structures` | List salary component formulas (Basic, HRA, DA, Special Allowance) | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `is_active`, `limit`, `cursor` | `200 OK` (`SalaryStructureListEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/salary-structures` | Create a parameterized salary structure formula template | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `SalaryStructureCreateRequest` | `201 Created` (`SalaryStructureDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/payroll/salary-assignments` | Query employee CTC assignments with effective dates and structure references | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `employee_id`, `active_on_date`, `limit`, `cursor` | `200 OK` (`SalaryAssignmentListEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/salary-assignments` | Assign or update employee CTC structure with future or backdated effective date | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `SalaryAssignmentCreateRequest` | `201 Created` (`SalaryAssignmentDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/payroll/pay-runs` | List pay runs with status, pay group, period filters, and financial totals | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Query: `pay_group_id`, `status`, `year`, `month`, `limit`, `cursor` | `200 OK` (`PayRunListEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/pay-runs` | **Step 0**: Initialize new pay run draft for pay group and period | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `PayRunInitializeRequest` | `201 Created` (`PayRunDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/payroll/pay-runs/{id}` | Get current pay run status, wizard step progress, and validation errors | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Path: `id` (UUID) | `200 OK` (`PayRunDetailEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/1-reconcile-attendance` | **Step 1**: Execute pre-run attendance reconciliation and identify anomalies | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`AttendanceReconciliationEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/2-freeze-leaves` | **Step 2**: Freeze leave balances, evaluate sandwich rules, compute LOP days | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`LeaveFreezeStepEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/3-variable-components` | **Step 3**: Upload/confirm variable earnings (bonuses, incentives) and deductions | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `VariableComponentsLoadRequest` | `200 OK` (`VariableComponentsStepEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/4-authorize-overtime` | **Step 4**: Commit supervisor-approved overtime hours (`N20`) into pay run | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `OvertimeCommitRequest` | `200 OK` (`OvertimeStepEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/5-compute-gross` | **Step 5**: Compute gross earnings with pro-ration for mid-month joiners/exits | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`GrossComputationStepEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/6-compute-statutory` | **Step 6**: Execute Indian statutory deductions (EPF, ESI, PT, TDS, LWF) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`StatutoryComputationStepEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/7-run-audit` | **Step 7**: Run variance analysis (>20% net pay diff), negative pay detection | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`PayrollAuditStepEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/8-lock` | **Step 8**: Permanently lock pay run and materialize immutable snapshots | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `PayRunLockRequest` | `200 OK` (`PayRunLockResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/9-disbursement-file` | **Step 9**: Generate bank-specific NEFT/RTGS CSV payment batch | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `DisbursementGenerateRequest` | `201 Created` (`DisbursementBatchEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/steps/10-publish-payslips` | **Step 10**: Render cryptographic password-protected PDF payslips to ESS | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `PayslipPublishRequest` | `202 Accepted` (`AsyncTaskEnqueuedEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/pay-runs/{id}/rollback` | Roll back pay run FSM to previous step (only permitted before Step 8 Lock) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `PayRunRollbackRequest` | `200 OK` (`PayRunDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `DELETE` | `/api/v1/payroll/pay-runs/{id}` | Discard draft pay run (strictly forbidden if status is LOCKED or DISBURSED) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `GET` | `/api/v1/payroll/pay-runs/{id}/snapshots` | Query locked employee payroll snapshots with pagination and department filters | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Path: `id` (UUID), Query: `department_id`, `limit`, `cursor` | `200 OK` (`SnapshotListEnvelope`) | Yes |
| `GET` | `/api/v1/payroll/pay-runs/{id}/snapshots/{employee_id}` | Retrieve individual employee immutable snapshot JSON with line-item breakdown | `EMPLOYEE` (self), `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), `employee_id` (UUID) | `200 OK` (`EmployeeSnapshotDetailEnvelope`) | Yes |
| `GET` | `/api/v1/payroll/payslips/{id}/pdf` | Download signed cryptographic PDF payslip | `EMPLOYEE` (self), `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Query: `password_override` | `200 OK` (Application/PDF stream) | Yes |
| `GET` | `/api/v1/payroll/employees/{employee_id}/payslips` | Self-service employee past payslips history list | `EMPLOYEE` (self), `HR_PAYROLL` | Path: `employee_id` (UUID), Query: `year`, `limit` | `200 OK` (`PayslipSummaryListEnvelope`) | Yes |
| `GET` | `/api/v1/payroll/overtime/requests` | List overtime authorization requests with approval status filters | `SUPERVISOR`, `HR_PAYROLL` | Query: `status`, `start_date`, `end_date`, `employee_id`, `limit` | `200 OK` (`OvertimeRequestListEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/overtime/requests` | Submit overtime authorization request with pre/post duty hours | `SUPERVISOR`, `EMPLOYEE` | Body: `OvertimeCreateRequest` | `201 Created` (`OvertimeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/overtime/requests/{id}/approve` | Supervisor explicit authorization of overtime hours (`N20`) | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `OvertimeApprovalRequest` | `200 OK` (`OvertimeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/overtime/requests/{id}/reject` | Supervisor rejection of overtime hours | `SUPERVISOR`, `HR_PAYROLL` | Path: `id` (UUID), Body: `OvertimeRejectRequest` | `200 OK` (`OvertimeDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/payroll/arrears/recalculate` | Calculate retroactive salary revision delta items across past locked periods | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `ArrearsRecalculateRequest` | `200 OK` (`ArrearsCalculationEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/payroll/arrears/pending` | List pending retroactive arrears adjustments queued for next open pay run | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `pay_group_id`, `employee_id` | `200 OK` (`PendingArrearsListEnvelope`) | Yes |
| `GET` | `/api/v1/payroll/statutory/parameters` | List effective-dated statutory tables (EPF ceiling, ESI ceiling, PT slabs) | `HR_PAYROLL`, `TENANT_ADMIN`, `SUPER_ADMIN` | Query: `statutory_type`, `effective_date` | `200 OK` (`StatutoryParametersListEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/statutory/parameters` | Create new versioned statutory parameter row (platform level) | `SUPER_ADMIN` | Body: `StatutoryParameterCreateRequest` | `201 Created` (`StatutoryParameterDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/payroll/pay-runs/{id}/exports/tally-xml` | Export Tally Prime XML journal vouchers (`INT-01`) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Query: `cost_center_id` | `200 OK` (Application/XML) | Yes |
| `GET` | `/api/v1/payroll/pay-runs/{id}/exports/bank-file` | Download bank disbursement batch file (HDFC, ICICI, SBI, Axis) | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Query: `bank_code`, `format` | `200 OK` (Text/CSV) | Yes |
| `GET` | `/api/v1/payroll/reports/epf-ecr` | Generate EPFO Electronic Challan Return (ECR) text file format | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `pay_run_id` (UUID) | `200 OK` (Text/Plain) | Yes |
| `GET` | `/api/v1/payroll/reports/esi-return` | Generate ESIC monthly contribution report | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `pay_run_id` (UUID) | `200 OK` (Application/vnd.ms-excel) | Yes |
| `GET` | `/api/v1/payroll/reports/pt-return` | Generate state-specific PT monthly schedule with Feb adjustment trace | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `pay_run_id` (UUID), `state_code` | `200 OK` (`PTReportEnvelope`) | Yes |
| `POST` | `/api/v1/payroll/webhooks/subscribe` | Register outbound webhook for `pay_run.locked` or `payslips.published` | `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `PayrollWebhookSubscriptionRequest` | `201 Created` (`WebhookSubscriptionEnvelope`) | Yes |

---

## 3. Detailed Request & Response Schemas for Critical Endpoints

### 3.1 Initialize Pay Run Draft (`POST /api/v1/payroll/pay-runs`)

#### Request Schema
```http
POST /api/v1/payroll/pay-runs HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: b7f8149e-128a-4952-b91c-72e9a22f4891

{
  "pay_group_id": "018f3a5b-9a8c-7000-8b01-333333333333",
  "period_start_date": "2026-11-01",
  "period_end_date": "2026-11-30",
  "scheduled_payout_date": "2026-12-01",
  "remarks": "Standard monthly payroll cycle November 2026"
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "pay_run_id": "018f3a5b-9a8c-7000-8b01-888888888888",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "pay_group_id": "018f3a5b-9a8c-7000-8b01-333333333333",
    "pay_group_name": "Headquarters Staff",
    "period_start_date": "2026-11-01",
    "period_end_date": "2026-11-30",
    "status": "DRAFT",
    "current_step": 0,
    "eligible_employee_count": 250,
    "total_gross_pay": "0.00",
    "total_net_pay": "0.00",
    "created_at": "2026-11-16T12:00:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T12:00:01Z",
    "requestId": "req_01j7b9m1"
  }
}
```

---

### 3.2 Execute Step 8: Pay Run Lock (`POST /api/v1/payroll/pay-runs/{id}/steps/8-lock`)

#### Request Schema
```http
POST /api/v1/payroll/pay-runs/018f3a5b-9a8c-7000-8b01-888888888888/steps/8-lock HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: 99a1f2e4-bb89-4672-8802-cd4175b9e013

{
  "confirm_audit_review": true,
  "override_variance_warnings": false,
  "authorized_by_notes": "All pre-payroll variance audits verified by Finance Controller."
}
```

#### Success Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "pay_run_id": "018f3a5b-9a8c-7000-8b01-888888888888",
    "status": "LOCKED",
    "locked_at": "2026-11-16T14:30:00Z",
    "locked_by_user_id": "018f3a5b-9a8c-7000-8b01-999999999999",
    "total_employees_locked": 250,
    "financial_summary": {
      "currency": "INR",
      "total_gross_earnings": "14250000.00",
      "total_epf_employee": "1080000.00",
      "total_epf_employer": "1080000.00",
      "total_esi_employee": "67500.00",
      "total_esi_employer": "292500.00",
      "total_pt": "50000.00",
      "total_tds": "850000.00",
      "total_net_disbursement": "12202500.00"
    },
    "snapshot_manifest": {
      "snapshot_count": 250,
      "storage_engine": "POSTGRESQL_JSONB",
      "immutability_enforced": true
    }
  },
  "meta": {
    "timestamp": "2026-11-16T14:30:02Z",
    "requestId": "req_01j7b9m2"
  }
}
```

---

### 3.3 Retrieve Immutable Payroll Snapshot (`GET /api/v1/payroll/pay-runs/{id}/snapshots/{employee_id}`)

#### Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "snapshot_id": "018f3a5b-9a8c-7000-8b01-cccccccccccc",
    "pay_run_id": "018f3a5b-9a8c-7000-8b01-888888888888",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "employee_id": "018f3a5b-9a8c-7000-8b01-222222222222",
    "employee_code": "EMP-0042",
    "employee_name": "Rajesh Sharma",
    "designation": "Senior CNC Machinist",
    "department": "Precision Engineering",
    "bank_account_masked": "XXXXXX4819",
    "bank_ifsc": "HDFC0000128",
    "pan_masked": "XXXXX1234A",
    "epf_uan": "100904819284",
    "days_summary": {
      "calendar_days": 30,
      "payable_days": 29.0,
      "present_days": 24.0,
      "weekly_offs": 4.0,
      "holidays": 1.0,
      "paid_leaves": 0.0,
      "loss_of_pay_days": 1.0
    },
    "earnings_breakdown": [
      { "component_code": "BASIC", "name": "Basic Salary", "amount": "30000.00" },
      { "component_code": "HRA", "name": "House Rent Allowance", "amount": "15000.00" },
      { "component_code": "SPEC_ALW", "name": "Special Allowance", "amount": "10000.00" },
      { "component_code": "OT_PAY", "name": "Overtime (Approved 8h)", "amount": "2500.00" },
      { "component_code": "ARREARS", "name": "Retroactive Arrears Oct", "amount": "1200.00" }
    ],
    "deductions_breakdown": [
      { "component_code": "EPF_EMP", "name": "Provident Fund (12% capped ₹15k)", "amount": "1800.00" },
      { "component_code": "PT", "name": "Professional Tax (Maharashtra)", "amount": "200.00" },
      { "component_code": "TDS", "name": "Income Tax (Sec 115BAC)", "amount": "1500.00" },
      { "component_code": "LOP_DED", "name": "Loss of Pay (1 Day)", "amount": "1833.33" }
    ],
    "gross_earnings": "58700.00",
    "total_deductions": "5333.33",
    "net_pay": "53366.67",
    "employer_statutory": {
      "epf_eps": "1250.00",
      "epf_diff": "550.00",
      "epf_admin": "150.00",
      "epf_edli": "75.00",
      "esi_employer": "0.00"
    },
    "statutory_versions_applied": {
      "epf_version": "EPF-INDIA-2024-V1",
      "pt_version": "PT-MAHARASHTRA-2025-V2",
      "tds_regime": "NEW_115BAC"
    },
    "snapshot_created_at": "2026-11-16T14:30:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T14:30:03Z",
    "requestId": "req_01j7b9m3"
  }
}
```

---

### 3.4 Generate Bank Disbursement Batch File (`POST /api/v1/payroll/pay-runs/{id}/steps/9-disbursement-file`)

#### Request Schema
```http
POST /api/v1/payroll/pay-runs/018f3a5b-9a8c-7000-8b01-888888888888/steps/9-disbursement-file HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: d219ef10-66a9-408a-9c71-334455667788

{
  "bank_code": "HDFC",
  "debit_account_number": "50200012345678",
  "payment_type": "NEFT",
  "batch_reference": "SAL-NOV26-HQ"
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "batch_id": "018f3a5b-9a8c-7000-8b01-dddddddddddd",
    "pay_run_id": "018f3a5b-9a8c-7000-8b01-888888888888",
    "bank_code": "HDFC",
    "payment_type": "NEFT",
    "record_count": 250,
    "total_batch_amount": "12202500.00",
    "file_format": "HDFC_CORPORATE_NEFT_CSV",
    "download_url": "/api/v1/payroll/pay-runs/018f3a5b-9a8c-7000-8b01-888888888888/exports/bank-file?batch_id=018f3a5b-9a8c-7000-8b01-dddddddddddd",
    "generated_at": "2026-11-16T15:00:00Z"
  },
  "meta": {
    "timestamp": "2026-11-16T15:00:01Z",
    "requestId": "req_01j7b9m4"
  }
}
```

---

## 4. Module-Specific Error Responses (RFC 7807)

### 4.1 409 Conflict: Mutation Prohibited on Locked Pay Run (`PAY-06`)
```json
{
  "success": false,
  "error": {
    "code": "PAY_RUN_ALREADY_LOCKED",
    "message": "The pay run is locked and cannot be modified. Retroactive corrections must be processed as next-cycle Arrears.",
    "details": [
      {
        "field": "pay_run_id",
        "issue": "Pay run 018f3a5b-9a8c-7000-8b01-888888888888 transitioned to LOCKED state at 2026-11-16T14:30:00Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T15:05:00Z",
    "requestId": "req_01j7b9m5"
  }
}
```

### 4.2 400 Bad Request: Pay Run Prerequisite Step Incomplete (`ADR-09`)
```json
{
  "success": false,
  "error": {
    "code": "WIZARD_STEP_PREREQUISITE_FAILED",
    "message": "Cannot proceed to Step 5 (Compute Gross) because Step 4 (Authorize Overtime) has not been finalized.",
    "details": [
      {
        "field": "current_step",
        "issue": "Step 4 has 14 un-reviewed overtime requests. Please approve or reject all pending requests."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T15:10:00Z",
    "requestId": "req_01j7b9m6"
  }
}
```

### 4.3 422 Unprocessable Entity: Pre-Payroll Audit Variance Warning (`PAY-01`)
```json
{
  "success": false,
  "error": {
    "code": "PAYROLL_AUDIT_VARIANCE_FAILURE",
    "message": "Pre-payroll audit failed with critical variance exceptions.",
    "details": [
      {
        "field": "employee_id:018f3a5b-9a8c-7000-8b01-222222222222",
        "issue": "Net pay decreased by 34.2% compared to prior month (threshold is 20%). Reason: 6 days unpaid LOP."
      },
      {
        "field": "employee_id:018f3a5b-9a8c-7000-8b01-333333333333",
        "issue": "Negative net pay detected (-₹1,450.00) due to salary advance recovery exceeding earned gross."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T15:15:00Z",
    "requestId": "req_01j7b9m7"
  }
}
```
