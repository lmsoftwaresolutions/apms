# Device Connector & Edge Telemetry REST API Specification (M07, M08 & M16)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Module Overview & Base URL

The **Device Connector & Edge Telemetry Engine** provides universal, secure connectivity between physical hardware biometric terminals (ZKTeco, eTimeOffice, eSSL, Realtime), on-premises **Edge Sync Agents**, shared tablet kiosks, and the APMS cloud ingestion pipeline.

Key Architectural Invariants:
- **Immutable Raw Ingestion (`ADR-05`, `PCH-01`, `BR-ING-01`)**:
  - Incoming payloads are recorded append-only in `raw_envelope`.
  - Monthly declarative table partitioning by `received_at` (`ADR-28`).
  - Cryptographic payload hashing (`SHA-256(tenant_id, device_id, raw_payload)`) for replay protection and deduplication.
  - Updates and deletions are strictly prohibited at the database schema level.
- **On-Premises Edge Sync Agent (`ADR-12`, `PCH-04`)**:
  - Local Python/Rust daemon deployed at factory or branch sites with unreliable network connectivity.
  - Buffers punches locally in an embedded SQLite database (up to 7 days offline buffer).
  - Automatically replays buffered punches via `/api/v1/devices/edge/batch-push` with rate limiting and exponential backoff upon network restoration.
- **Heartbeat & Telemetry Enforcement (`DEV-02`, `DEV-04`, `BR-DEV-01`)**:
  - Hardware devices and Edge Agents transmit a telemetry ping every 60 seconds.
  - System tracks hardware clock drift against cloud NTP time; discrepancy $> 5\text{ minutes}$ tags new punches with `CLOCK_DRIFT_WARNING` and generates an administrative maintenance alert.
  - Sync queue lag ($> 15\text{ minutes}$) triggers high-priority operational notifications.
- **Shared Tablet / Kiosk Mode (`DEV-03`, `BR-BIO-01`)**:
  - Android tablet app with PIN and on-device face verification for branches without biometric hardware.
  - Raw facial templates remain strictly on edge hardware; never transmitted in plain text across cloud networks.
- **Biometric ID Mapping (`EMP-04`)**:
  - Bridges employee UUIDs with machine-specific integer or alphanumeric user IDs (`employee_device_mappings`).

### Base URLs
```http
/api/v1/devices
/api/v1/ingestion
```

### Authentication & Device Protocols
- **Device Push Authentication**:
  - `X-Device-Serial`: Alphanumeric hardware terminal serial number.
  - `X-Device-Token`: Provisioned secret bearer token stored hashed at rest.
  - `X-Payload-Hash`: SHA-256 signature of request body for integrity validation.
- **Management API Authentication**: `Authorization: Bearer <JWT>` with standard tenant context resolution (`SET LOCAL app.current_tenant_id`).

---

## 2. Comprehensive REST Endpoint Table

| Method | Endpoint Path | Description | Required RBAC Role | Query / Body Params | Response Schema / Status | Idempotent |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/devices` | List registered biometric terminals and edge sync agents | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `branch_id`, `status`, `device_type`, `limit`, `cursor` | `200 OK` (`DeviceListEnvelope`) | Yes |
| `POST` | `/api/v1/devices` | Register a new biometric hardware terminal or edge daemon | `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `DeviceRegisterRequest` | `201 Created` (`DeviceDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/devices/{id}` | Retrieve device configuration, network parameters, and sync status | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`DeviceDetailEnvelope`) | Yes |
| `PUT` | `/api/v1/devices/{id}` | Update device details (branch, gate/zone location, IP address) | `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID), Body: `DeviceUpdateRequest` | `200 OK` (`DeviceDetailEnvelope`) | Yes (`If-Match`) |
| `DELETE` | `/api/v1/devices/{id}` | Decommission / deactivate hardware biometric terminal | `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `POST` | `/api/v1/devices/{id}/regenerate-token` | Regenerate device push authentication secret token (`X-Device-Token`) | `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID) | `200 OK` (`DeviceTokenResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/devices/push` | Ingest real-time punch event push from biometric hardware terminals | `DEVICE_AGENT` (Header auth) | Headers: `X-Device-Serial`, `X-Device-Token`, `X-Payload-Hash`, Body: Raw / JSON payload | `200 OK` (`IngestionAckEnvelope`) | Yes (Debounced & Deduplicated) |
| `POST` | `/api/v1/devices/edge/batch-push` | Ingest offline-buffered batch replay from on-premises Edge Sync Agent | `EDGE_AGENT` (Header auth) | Headers: `X-Device-Serial`, `X-Device-Token`, Body: `EdgeBatchPushRequest` | `200 OK` (`BatchIngestionAckEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/devices/kiosk/punch` | Ingest tablet kiosk punch with PIN / on-device face match verification | `KIOSK_APP` (Header auth) | Body: `KioskPunchRequest` | `201 Created` (`PunchEventResponseEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/devices/raw-envelopes` | Audit query raw ingestion payload log (`raw_envelope`) | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Query: `device_id`, `start_time`, `end_time`, `limit`, `cursor` | `200 OK` (`RawEnvelopeListEnvelope`) | Yes |
| `GET` | `/api/v1/devices/raw-envelopes/{id}` | Retrieve individual raw envelope payload and SHA-256 hash | `HR_PAYROLL`, `TENANT_ADMIN`, `AUDITOR` | Path: `id` (UUID) | `200 OK` (`RawEnvelopeDetailEnvelope`) | Yes |
| `POST` | `/api/v1/devices/{id}/heartbeat` | 60-second telemetry ping transmitting queue lag and clock drift | `DEVICE_AGENT`, `EDGE_AGENT` | Path: `id` (UUID), Body: `DeviceHeartbeatRequest` | `200 OK` (`HeartbeatAckEnvelope`) | Yes |
| `GET` | `/api/v1/devices/health` | Real-time health dashboard: online/offline status, drift, un-synced lag | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `branch_id`, `status` | `200 OK` (`DeviceHealthDashboardEnvelope`) | Yes |
| `GET` | `/api/v1/devices/{id}/diagnostics` | Historical telemetry log: latency, clock drift deviation, error logs | `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID), Query: `hours_back` | `200 OK` (`DeviceDiagnosticsEnvelope`) | Yes |
| `GET` | `/api/v1/devices/employee-mappings` | Query employee-to-biometric user ID mappings (`EMP-04`) | `HR_PAYROLL`, `TENANT_ADMIN` | Query: `employee_id`, `device_id`, `limit`, `cursor` | `200 OK` (`BiometricMappingListEnvelope`) | Yes |
| `POST` | `/api/v1/devices/employee-mappings` | Map employee UUID to biometric machine user ID | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `BiometricMappingCreateRequest` | `201 Created` (`BiometricMappingDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `PUT` | `/api/v1/devices/employee-mappings/{id}` | Update biometric mapping details or privilege level | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `BiometricMappingUpdateRequest` | `200 OK` (`BiometricMappingDetailEnvelope`) | Yes |
| `DELETE` | `/api/v1/devices/employee-mappings/{id}` | Remove biometric mapping | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID) | `200 OK` (`ActionSuccessEnvelope`) | Yes |
| `POST` | `/api/v1/devices/employee-mappings/bulk` | Bulk import employee-to-device biometric mappings via CSV | `HR_PAYROLL`, `TENANT_ADMIN` | Body: `BulkMappingImportRequest` | `200 OK` (`BulkActionSummaryEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/devices/{id}/commands` | List remote commands queued or dispatched to hardware terminal | `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID), Query: `status`, `limit` | `200 OK` (`DeviceCommandListEnvelope`) | Yes |
| `POST` | `/api/v1/devices/{id}/commands` | Enqueue command to device: `REBOOT`, `SYNC_TIME`, `PUSH_USER`, `CLEAR_LOG` | `TENANT_ADMIN`, `SUPER_ADMIN` | Path: `id` (UUID), Body: `DeviceCommandCreateRequest` | `201 Created` (`DeviceCommandDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/devices/edge/config` | Edge Sync Agent pulls sync configuration, employee lists, and intervals | `EDGE_AGENT` (Header auth) | Query: `agent_version` | `200 OK` (`EdgeConfigEnvelope`) | Yes |
| `POST` | `/api/v1/devices/import/csv` | Bulk upload historical punch file (CSV / XLSX) for async ingestion | `HR_PAYROLL`, `TENANT_ADMIN` | Form-data: `file`, `timezone`, `re_pair_punches` | `202 Accepted` (`AsyncTaskEnqueuedEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/devices/import/preview` | Dry-run preview of uploaded punch file with syntax and employee checks | `HR_PAYROLL`, `TENANT_ADMIN` | Form-data: `file`, `timezone` | `200 OK` (`ImportPreviewEnvelope`) | Yes |
| `GET` | `/api/v1/devices/import/status/{task_id}` | Check progress and error log of punch CSV import background worker | `HR_PAYROLL`, `TENANT_ADMIN` | Path: `task_id` (UUID) | `200 OK` (`TaskProgressEnvelope`) | Yes |
| `GET` | `/api/v1/devices/alerts` | Query active hardware alerts: offline $> 15\text{m}$, clock drift $> 5\text{m}$ | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Query: `branch_id`, `severity`, `is_acknowledged` | `200 OK` (`DeviceAlertListEnvelope`) | Yes |
| `POST` | `/api/v1/devices/alerts/{id}/acknowledge` | Acknowledge active hardware maintenance alert with resolution note | `SUPERVISOR`, `HR_PAYROLL`, `TENANT_ADMIN` | Path: `id` (UUID), Body: `AlertAcknowledgeRequest` | `200 OK` (`DeviceAlertDetailEnvelope`) | Yes (`Idempotency-Key`) |
| `POST` | `/api/v1/devices/webhooks/subscribe` | Register outbound webhook for `device.offline`, `device.clock_drift` | `TENANT_ADMIN`, `SUPER_ADMIN` | Body: `DeviceWebhookSubscriptionRequest` | `201 Created` (`WebhookSubscriptionEnvelope`) | Yes |

---

## 3. Detailed Request & Response Schemas for Critical Endpoints

### 3.1 Biometric Terminal Direct Push (`POST /api/v1/devices/push`)

#### Request Schema
```http
POST /api/v1/devices/push HTTP/1.1
Host: api.apms.example.com
X-Device-Serial: ZK-PRO-88194
X-Device-Token: sec_dev_8f29104812bc8491a0
X-Payload-Hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
Content-Type: application/json

{
  "terminal_sn": "ZK-PRO-88194",
  "log_count": 2,
  "events": [
    {
      "biometric_user_id": "1042",
      "timestamp": "2026-11-16 08:04:12",
      "verification_mode": "FINGERPRINT",
      "in_out_state": "0",
      "work_code": "0"
    },
    {
      "biometric_user_id": "1088",
      "timestamp": "2026-11-16 08:04:35",
      "verification_mode": "FACE",
      "in_out_state": "0",
      "work_code": "0"
    }
  ]
}
```

#### Success Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "raw_envelope_id": "018f3a5b-9a8c-7000-8b01-111122223333",
    "device_id": "018f3a5b-9a8c-7000-8b01-444455556666",
    "tenant_id": "018f3a5b-9a8c-7000-8b01-111111111111",
    "received_at": "2026-11-16T02:34:36.104Z",
    "processed_count": 2,
    "accepted_punches": 2,
    "debounced_duplicates": 0,
    "unmapped_user_ids": []
  },
  "meta": {
    "timestamp": "2026-11-16T02:34:36Z",
    "requestId": "req_01j7b9q1"
  }
}
```

---

### 3.2 Edge Sync Agent Offline Replay Batch Push (`POST /api/v1/devices/edge/batch-push`)

#### Request Schema
```http
POST /api/v1/devices/edge/batch-push HTTP/1.1
Host: api.apms.example.com
X-Device-Serial: EDGE-DAEMON-BRANCH-B
X-Device-Token: sec_edge_1928471928401928
Content-Type: application/json
Idempotency-Key: e829104b-9122-48f1-88ef-192847102948

{
  "agent_id": "018f3a5b-9a8c-7000-8b01-777788889999",
  "batch_sequence_number": 481,
  "offline_interval": {
    "start_time": "2026-11-15T18:00:00Z",
    "end_time": "2026-11-16T06:00:00Z",
    "duration_offline_minutes": 720
  },
  "punches": [
    {
      "local_record_id": 104291,
      "device_serial": "ZK-SN-00192",
      "biometric_user_id": "2041",
      "punch_time_local": "2026-11-15 22:04:15",
      "utc_timestamp": "2026-11-15T16:34:15Z",
      "verification_type": "FINGERPRINT",
      "tamper_detected": false
    },
    {
      "local_record_id": 104292,
      "device_serial": "ZK-SN-00192",
      "biometric_user_id": "2042",
      "punch_time_local": "2026-11-15 22:05:02",
      "utc_timestamp": "2026-11-15T16:35:02Z",
      "verification_type": "FINGERPRINT",
      "tamper_detected": false
    }
  ]
}
```

#### Success Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "batch_status": "COMMITTED",
    "batch_sequence_number": 481,
    "total_records_received": 2,
    "committed_to_raw_envelope": 2,
    "normalized_punch_events": 2,
    "pairing_tasks_dispatched": 2,
    "client_ack_token": "ack_018f3a5b_batch_481"
  },
  "meta": {
    "timestamp": "2026-11-16T06:05:00Z",
    "requestId": "req_01j7b9q2"
  }
}
```

---

### 3.3 Device Heartbeat & Telemetry Ping (`POST /api/v1/devices/{id}/heartbeat`)

#### Request Schema
```http
POST /api/v1/devices/018f3a5b-9a8c-7000-8b01-444455556666/heartbeat HTTP/1.1
Host: api.apms.example.com
X-Device-Serial: ZK-PRO-88194
X-Device-Token: sec_dev_8f29104812bc8491a0
Content-Type: application/json

{
  "terminal_local_time": "2026-11-16T08:05:12+05:30",
  "firmware_version": "Ver 8.2.1-Build2025",
  "un_synced_log_count": 0,
  "free_log_capacity_percentage": 94,
  "network_metrics": {
    "ip_address": "192.168.1.140",
    "mac_address": "00:1A:79:B4:88:19",
    "rssi_dbm": -58
  }
}
```

#### Success Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": {
    "device_id": "018f3a5b-9a8c-7000-8b01-444455556666",
    "status": "ONLINE",
    "server_time_utc": "2026-11-16T02:35:12.450Z",
    "calculated_clock_drift_seconds": 1.2,
    "clock_drift_status": "ACCEPTABLE",
    "pending_commands_count": 0,
    "next_heartbeat_interval_seconds": 60
  },
  "meta": {
    "timestamp": "2026-11-16T02:35:12Z",
    "requestId": "req_01j7b9q3"
  }
}
```

---

### 3.4 Enqueue Remote Command to Hardware Terminal (`POST /api/v1/devices/{id}/commands`)

#### Request Schema
```http
POST /api/v1/devices/018f3a5b-9a8c-7000-8b01-444455556666/commands HTTP/1.1
Host: api.apms.example.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
Idempotency-Key: b4819201-4822-4a01-9b10-88ef49201948

{
  "command_type": "SYNC_TIME",
  "payload": {
    "target_ntp_server": "pool.ntp.org",
    "utc_timestamp": "2026-11-16T03:00:00Z"
  },
  "priority": "HIGH",
  "expires_in_minutes": 60
}
```

#### Success Response Schema (`201 Created`)
```json
{
  "success": true,
  "data": {
    "command_id": "018f3a5b-9a8c-7000-8b01-999900001111",
    "device_id": "018f3a5b-9a8c-7000-8b01-444455556666",
    "command_type": "SYNC_TIME",
    "status": "QUEUED",
    "queued_at": "2026-11-16T03:00:00Z",
    "dispatched_at": null,
    "completed_at": null
  },
  "meta": {
    "timestamp": "2026-11-16T03:00:01Z",
    "requestId": "req_01j7b9q4"
  }
}
```

---

## 4. Module-Specific Error Responses (RFC 7807)

### 4.1 401 Unauthorized: Invalid Device Authentication Credentials
```json
{
  "success": false,
  "error": {
    "code": "DEVICE_AUTHENTICATION_FAILED",
    "message": "Hardware terminal authentication failed. Invalid device serial or secret token.",
    "details": [
      {
        "field": "X-Device-Token",
        "issue": "Provided token signature does not match enrolled cryptographic secret for serial ZK-PRO-88194."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T03:05:00Z",
    "requestId": "req_01j7b9q5"
  }
}
```

### 4.2 400 Bad Request: SHA-256 Signature Mismatch
```json
{
  "success": false,
  "error": {
    "code": "PAYLOAD_HASH_MISMATCH",
    "message": "Calculated SHA-256 payload digest does not match X-Payload-Hash header. Transmission tampering detected.",
    "details": [
      {
        "field": "X-Payload-Hash",
        "issue": "Header digest: e3b0c442... computed digest: 7f83b165..."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T03:10:00Z",
    "requestId": "req_01j7b9q6"
  }
}
```

### 4.3 422 Unprocessable Entity: Unmapped Biometric User ID (`EMP-04`)
```json
{
  "success": false,
  "error": {
    "code": "BIOMETRIC_USER_UNMAPPED",
    "message": "Punch payload references a biometric machine user ID that is not enrolled in the tenant employee catalog.",
    "details": [
      {
        "field": "biometric_user_id",
        "issue": "User ID '9999' on device ZK-PRO-88194 has no active mapping in employee_device_mappings. Punch quarantined."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-11-16T03:15:00Z",
    "requestId": "req_01j7b9q7"
  }
}
```
