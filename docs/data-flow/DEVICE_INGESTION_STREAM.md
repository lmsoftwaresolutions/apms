# APMS High-Throughput Device Ingestion Stream Architecture

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Executive Summary & Architectural Invariants

Biometric time and attendance data is the primary operational input to the entire APMS payroll and workforce management lifecycle. In high-density industrial deployments (e.g., manufacturing plants with shift changes involving 5,000+ factory workers punching in within a 15-minute window), the biometric hardware ingestion stream experiences massive traffic bursts.

Furthermore, physical hardware terminals frequently operate on unreliable branch networks or air-gapped factory local area networks (LANs). 

To ensure **zero punch loss**, **sub-second ingestion acknowledgement (< 200ms)**, and **cryptographic audit integrity**, the APMS Ingestion Stream is engineered around four non-negotiable architectural invariants:

1. **Strict Raw Immutability (`ADR-05`, `BR-ING-01`)**: All incoming payloads from biometric hardware, edge agents, mobile apps, or API imports are recorded byte-for-byte in the `raw_envelope` table. Deletion and in-place updates are strictly forbidden by database trigger and RLS constraints.
2. **Asynchronous Ingestion Decoupling**: The synchronous HTTP request boundary terminates immediately upon persisting the raw envelope. Payload parsing, deduplication, employee resolution, and session pairing execute completely asynchronously in background Celery queues.
3. **Declarative Partitioning (`ADR-28`)**: Both `raw_envelope` and `punch_event` tables are declaratively range-partitioned by calendar month (`PARTITION BY RANGE (received_at)` and `punch_time`), guaranteeing constant-time indexing and frictionless 12-month data retention lifecycle management.
4. **Air-Gapped Edge Resilience (`ADR-12`, `PCH-04`)**: The on-premises Edge Sync Agent buffers punches locally in an embedded SQLite database (7-day offline capacity) and drains queues systematically with exponential backoff upon WAN restoration.

---

## 2. End-to-End High-Throughput Ingestion Architecture

```mermaid
flowchart TD
    subgraph EdgeTier["Physical Edge Tier (Factory / Branch LAN)"]
        direction TB
        ZK["ZKTeco ADMS Devices\n(Direct HTTP Post)"]
        ET["eTimeOffice Cloud / Local\n(HTTP Poll)"]
        USB["Legacy RS485 / USB Scanners\n(Serial SDK)"]
        
        subgraph LocalAgent["APMS Edge Sync Agent (Local Windows / Linux Daemon)"]
            ADAPT["Hardware Protocol Adapters"]
            SQLITE[("Local Embedded SQLite Buffer\n[edge_buffer.db - WAL Mode]\n(7-Day Offline Retention)")]
            CIRCUIT["Circuit Breaker & FIFO Dispatcher"]
            HEARTBEAT_GEN["Heartbeat Generator\n(60s Telemetry Pings)"]
        end
    end

    subgraph NetworkBoundary["Network Boundary & WAN Ingress"]
        FIREWALL["Local Firewall\n(Outbound Port 443 Only)"]
        NGINX["Nginx Cloud Reverse Proxy\n• TLS 1.3 Termination\n• Rate Limiting (100 req/s/device)\n• Connection Pooling"]
    end

    subgraph APMSCloudIngress["APMS Cloud Ingestion Service (FastAPI)"]
        INGEST_API["POST /api/v1/devices/push\n(Synchronous Fast-Path < 50ms)"]
        AUTH_VAL["Device Token & Checksum Validator\n(HMAC / SHA-256 Signature)"]
        IDEMP_CACHE["Redis Short-Lived Cache\n(60s Deduplication Hash)"]
    end

    subgraph PersistenceLayer["Storage Layer (PostgreSQL 16+)"]
        RAW_TABLE[("raw_envelope\n(Append-Only / Partitioned by Month)")]
        PUNCH_STREAM[("punch_event\n(Normalized Event Stream / Partitioned)")]
    end

    subgraph AsyncPipeline["Asynchronous Processing Engine (Celery + Redis)"]
        CELERY_REDIS[("Redis Message Broker\nQueue: punch_normalization")]
        NORM_WORKER["Normalization Celery Worker"]
        DEBOUNCE_EVAL{"Debounce Check\n(< 60s window)"}
        DRIFT_EVAL{"Clock Drift Check\n(|Device - Server| > 5 min)"}
        PAIRING_QUEUE[("Redis Message Broker\nQueue: punch_pairing")]
    end

    %% Edge Connections
    ZK --> ADAPT
    ET --> ADAPT
    USB --> ADAPT
    ADAPT -->|Immediate Write| SQLITE
    SQLITE --> CIRCUIT
    CIRCUIT -->|HTTPS POST| FIREWALL
    HEARTBEAT_GEN -->|Heartbeat| CIRCUIT
    FIREWALL -->|WAN / Internet| NGINX

    %% Cloud Ingress
    NGINX --> INGEST_API
    INGEST_API --> AUTH_VAL
    AUTH_VAL <--> IDEMP_CACHE
    AUTH_VAL -->|Direct INSERT| RAW_TABLE
    INGEST_API -->>|202 Accepted| NGINX

    %% Async Transition
    RAW_TABLE -.->|Enqueue Event ID| CELERY_REDIS
    CELERY_REDIS --> NORM_WORKER
    NORM_WORKER --> DEBOUNCE_EVAL
    DEBOUNCE_EVAL -->|Duplicate| DISCARD_LOG["Mark DUPLICATE_IGNORED"]
    DEBOUNCE_EVAL -->|Unique| DRIFT_EVAL
    DRIFT_EVAL -->|Drift > 5m| DRIFT_ALERT["Tag CLOCK_DRIFT_WARNING\nEmit Admin Alert"]
    DRIFT_EVAL -->|Valid / Tagged| PUNCH_STREAM
    PUNCH_STREAM --> PAIRING_QUEUE
```

---

## 3. Ingestion Protocol & Device Authentication Flow

Hardware biometric devices push batches of punch records over HTTP/HTTPS. The Edge Sync Agent or direct ADMS terminals authenticate using cryptographic headers:

```mermaid
sequenceDiagram
    autonumber
    actor Edge as Edge Sync Agent / Terminal
    participant Nginx as Nginx Reverse Proxy
    participant API as FastAPI Ingestion Endpoint
    participant Redis as Redis Deduplication Cache
    participant DB as PostgreSQL (raw_envelope)
    participant Broker as Celery Task Broker (Redis)

    Edge->>Nginx: POST /api/v1/devices/push\nHeaders:\n  X-Device-Serial: ZK_FAC_01_TURNSTILE\n  X-Device-Token: tok_sec_8f9a2b...\n  X-Payload-Hash: sha256_hex_digest\nPayload: [JSON or ADMS Form-Data batch]

    Nginx->>API: Proxy request (TLS terminated, client IP attached)

    %% Step 1: Device Authentication
    rect rgb(240, 248, 255)
    Note over API: Step 1: Device Authentication & Tenant Resolution
    API->>API: Query cached device registration by serial\nValidate X-Device-Token against hashed secret
    alt Device Invalid or Inactive
        API-->>Edge: 401 Unauthorized {"code": "DEVICE_AUTHENTICATION_FAILED"}
    else Device Valid
        Note over API: Resolved tenant_id & device_id
    end
    end

    %% Step 2: Payload Checksum Verification
    rect rgb(255, 250, 240)
    Note over API: Step 2: Cryptographic Payload Integrity Check
    API->>API: Compute SHA-256(request.body)
    alt SHA-256 != X-Payload-Hash
        API-->>Edge: 400 Bad Request {"code": "PAYLOAD_CHECKSUM_MISMATCH"}
    else Checksum Valid
        Note over API: Payload integrity verified
    end
    end

    %% Step 3: Fast Idempotency Cache Check
    rect rgb(240, 255, 240)
    Note over API, Redis: Step 3: 60-Second Batch Replay Check
    API->>Redis: SET device:idemp:{device_id}:{sha256} "1" NX EX 60
    alt Redis returns nil (Duplicate Batch within 60s)
        API-->>Edge: 200 OK {"status": "ALREADY_PROCESSED", "records_received": 0}\n(Idempotent success)
    else Redis returns OK (Unique Batch)
        Note over API: New batch accepted for processing
    end
    end

    %% Step 4: Raw Envelope Persistence
    rect rgb(255, 245, 245)
    Note over API, DB: Step 4: Strict Raw Envelope Insert (ADR-05)
    API->>DB: INSERT INTO raw_envelope (tenant_id, device_id, raw_payload, payload_hash, received_at)\nVALUES (:tenant_id, :device_id, :raw_payload, :sha256, NOW()) RETURNING id;
    DB-->>API: envelope_id = 98124
    API->>Broker: LPUSH punch_normalization {envelope_id: 98124, tenant_id: :tid}
    end

    API-->>Edge: 202 Accepted {"status": "QUEUED", "envelope_id": 98124, "count": 25}
```

---

## 4. Normalization & Celery Worker Processing Pipeline

Once stored in `raw_envelope`, the background worker in queue `punch_normalization` normalizes the raw biometric records into clean, session-pairable `punch_event` records.

```mermaid
flowchart TD
    START(["Celery Worker picks envelope_id from queue"]) --> FETCH_RAW["Fetch raw_envelope by envelope_id"]
    FETCH_RAW --> PARSE_PAYLOAD["Parse Payload (ADMS / eSSL / JSON)\nExtract punches: [enrollment_id, device_timestamp, punch_type]"]
    
    PARSE_PAYLOAD --> LOOP_PUNCH["For each punch in batch"]
    
    LOOP_PUNCH --> RES_EMP["Resolve employee_id via mapping:\n(tenant_id, device_id, enrollment_id)"]
    
    RES_EMP --> EMP_EXISTS{"Employee Found?"}
    EMP_EXISTS -->|No| UNKNOWN_EMP["Tag ANOMALY: UNMAPPED_ENROLLMENT_ID\nWrite to punch_event with employee_id = NULL"]
    EMP_EXISTS -->|Yes| CHECK_DEBOUNCE["Debounce Evaluation (Rule BR-PCH-01):\nQuery last punch for employee within 60s"]
    
    CHECK_DEBOUNCE --> IS_DEBOUNCE{"Punch within 60s\nof previous punch?"}
    IS_DEBOUNCE -->|Yes| MARK_DUP["Set status = DUPLICATE_IGNORED\n(Excluded from session pairing)"]
    IS_DEBOUNCE -->|No| CHECK_DRIFT["Clock Drift Evaluation (Rule BR-DEV-01):\nCompare device_timestamp vs envelope received_at"]
    
    CHECK_DRIFT --> IS_DRIFT{"|device_timestamp - received_at|\n> 5 Minutes?"}
    IS_DRIFT -->|Yes| MARK_DRIFT["Set status = ACTIVE\nTag: CLOCK_DRIFT_WARNING\nEmit Admin Warning Event"]
    IS_DRIFT -->|No| MARK_ACTIVE["Set status = ACTIVE\nClean normal punch"]
    
    MARK_DUP --> WRITE_PUNCH["INSERT INTO punch_event (\n  tenant_id, employee_id, device_id,\n  punch_time, raw_envelope_id, status, flags\n)"]
    UNKNOWN_EMP --> WRITE_PUNCH
    MARK_DRIFT --> WRITE_PUNCH
    MARK_ACTIVE --> WRITE_PUNCH
    
    WRITE_PUNCH --> NEXT_PUNCH{"More punches in batch?"}
    NEXT_PUNCH -->|Yes| LOOP_PUNCH
    NEXT_PUNCH -->|No| DISPATCH_PAIR["Enqueue Celery punch_pairing task\n(Pass affected employee_ids & dates)"]
    DISPATCH_PAIR --> COMPLETE(["Worker finishes task (ACK)"])
```

---

## 5. Database Schema & Declarative Partitioning Strategy

### 5.1 `raw_envelope` Partitioned DDL
```sql
-- Master Ingestion Table: Declarative Range Partitioning by Month
CREATE TABLE raw_envelope (
    id BIGSERIAL,
    tenant_id UUID NOT NULL,
    device_id UUID NOT NULL,
    raw_payload TEXT NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    CONSTRAINT pk_raw_envelope PRIMARY KEY (received_at, id)
) PARTITION BY RANGE (received_at);

-- Example Monthly Partitions
CREATE TABLE raw_envelope_y2026m11 PARTITION OF raw_envelope
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE raw_envelope_y2026m12 PARTITION OF raw_envelope
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- Indexes
CREATE INDEX idx_raw_env_tenant_status ON raw_envelope (tenant_id, status, received_at);
CREATE INDEX idx_raw_env_hash ON raw_envelope (tenant_id, payload_hash, received_at);

-- Enforce Multi-Tenant Row Level Security
ALTER TABLE raw_envelope ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_envelope FORCE ROW LEVEL SECURITY;

CREATE POLICY raw_envelope_tenant_isolation ON raw_envelope
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

### 5.2 `punch_event` Partitioned DDL
```sql
-- Normalized Punch Stream Table: Declarative Range Partitioning by Month
CREATE TABLE punch_event (
    id BIGSERIAL,
    tenant_id UUID NOT NULL,
    employee_id UUID,                     -- NULL if unmapped biometric enrollment ID
    device_id UUID NOT NULL,
    raw_envelope_id BIGINT NOT NULL,
    punch_time TIMESTAMPTZ NOT NULL,       -- Hardware terminal timestamp
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    direction VARCHAR(16) NOT NULL DEFAULT 'AUTO', -- CHECK_IN, CHECK_OUT, BREAK_OUT, BREAK_IN, AUTO
    verification_type VARCHAR(32) NOT NULL DEFAULT 'FINGERPRINT', -- FACE, FINGERPRINT, RFID, PIN
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DUPLICATE_IGNORED, ANOMALOUS, SUPERSEDED
    flags JSONB NOT NULL DEFAULT '{}'::jsonb,      -- {"clock_drift_warning": true, "unmapped_device": false}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_punch_event PRIMARY KEY (punch_time, id)
) PARTITION BY RANGE (punch_time);

-- Example Monthly Partitions
CREATE TABLE punch_event_y2026m11 PARTITION OF punch_event
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE punch_event_y2026m12 PARTITION OF punch_event
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- Composite Performance Indexes
CREATE INDEX idx_punch_event_pairing ON punch_event (tenant_id, employee_id, punch_time, status);
CREATE INDEX idx_punch_event_device ON punch_event (device_id, punch_time);

-- Multi-Tenant Row Level Security
ALTER TABLE punch_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_event FORCE ROW LEVEL SECURITY;

CREATE POLICY punch_event_tenant_isolation ON punch_event
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

---

## 6. Edge Sync Agent Catch-Up & Reconnection Protocol

When a plant or remote branch experiences an internet blackout:
1. **Local Buffering**: All hardware punches continue to be captured by the Edge Sync Agent and committed immediately to the local embedded SQLite database running in **WAL (Write-Ahead Logging)** mode.
2. **Offline Capacity**: Sized to hold > 1,000,000 punch events (exceeding 7 consecutive days of full factory operations without internet).
3. **WAN Reconnection Trigger**: When internet connectivity returns, the Edge Agent activates its FIFO Drainage Controller:

```mermaid
stateDiagram-v2
    [*] --> MONITORING: Normal Online Operation
    MONITORING --> BUFFERING: WAN Disconnected / HTTP 5xx
    
    state BUFFERING {
        [*] --> LOCAL_STORE: Terminal pushes punch
        LOCAL_STORE --> FIFO_QUEUE: Commit to edge_buffer.db
        FIFO_QUEUE --> PING_CHECK: Periodic Cloud Ping (every 10s)
        PING_CHECK --> LOCAL_STORE: Cloud Unreachable
    }

    BUFFERING --> DRAINING: WAN Re-established (HTTP 200 on /health)
    
    state DRAINING {
        [*] --> BATCH_FETCH: SELECT 200 oldest punches FROM edge_buffer
        BATCH_FETCH --> COMPUTE_HASH: Calculate SHA-256 batch signature
        COMPUTE_HASH --> HTTPS_POST: POST /api/v1/devices/push
        HTTPS_POST --> VERIFY_ACK: Check HTTP 202 Accepted
        VERIFY_ACK --> DELETE_LOCAL: DELETE FROM edge_buffer WHERE id IN (...)
        DELETE_LOCAL --> CHECK_EMPTY: edge_buffer empty?
        CHECK_EMPTY --> BATCH_FETCH: More buffered punches exist
    }

    DRAINING --> MONITORING: Buffer 100% drained (Zero backlog)
    DRAINING --> BUFFERING: WAN fails mid-drain (Backoff triggered)
```

### Rate Limiting & Backoff Constraints:
- **Maximum Batch Size**: 200 punches per HTTPS POST payload.
- **Throttling Delay**: 100ms pacing between consecutive batch dispatches to prevent overwhelming the cloud ingress API.
- **Circuit Breaker**: On HTTP 429 (Too Many Requests) or 503 (Service Unavailable), backoff exponentially ($2s, 4s, 8s, 16s, \dots \text{max } 120s$) with full jitter.

---

## 7. Device Heartbeat, Clock Drift & Telemetry Stream

Under requirement **`DEV-02`** and **`BR-DEV-01`**, hardware health and time synchronization are monitored continuously:

```mermaid
sequenceDiagram
    autonumber
    actor Device as Biometric Device / Agent
    participant Ingest as POST /api/v1/devices/heartbeat
    participant Redis as Redis Telemetry Cache
    participant Postgres as PostgreSQL (devices table)

    Device->>Ingest: POST /api/v1/devices/heartbeat\n{\n  "device_serial": "ZK_FAC_01",\n  "firmware_version": "v3.8.1",\n  "device_time": "2026-11-16T16:35:00Z",\n  "buffered_punch_count": 0,\n  "ip_address": "192.168.1.105"\n}

    Ingest->>Ingest: Server Time = 2026-11-16T16:35:02Z\nDrift = |16:35:00 - 16:35:02| = 2 seconds (Within 5-min threshold)

    Ingest->>Redis: HSET device:status:{serial} last_seen=NOW() drift_seconds=2 status=ONLINE
    Ingest->>Postgres: UPDATE devices SET last_heartbeat_at = NOW(), clock_drift_seconds = 2, status = 'ONLINE' WHERE serial_number = :serial;

    Ingest-->>Device: 200 OK {"sync_server_time": "2026-11-16T16:35:02Z", "action": "NO_OP"}
```

### Clock Drift Threshold Enforcement (`BR-DEV-01`):
- If $\Delta T = |\text{device\_time} - \text{server\_time}| > 300\text{ seconds}$ (5 minutes):
  1. The API responds with an NTP synchronization directive: `{"action": "SYNC_CLOCK", "correct_time": "..."}`.
  2. Future punches arriving from this device are tagged with `flags: {"clock_drift_warning": true}` in `punch_event`.
  3. A high-priority operational alert is triggered for the Device Administrator in the APMS monitoring console.

---

## 8. Failure Modes & Operational Resilience

| Failure Scenario | Impact | System Defensive Control |
| :--- | :--- | :--- |
| **Complete WAN Outage at Factory Site** | Devices unable to reach cloud API | Edge Sync Agent buffers punches locally in SQLite WAL storage for up to 7 days. Zero punch loss. |
| **Ingestion API DDoS / Surge** | Ingress endpoint flooded with 50,000 req/sec | Nginx connection rate limiting (`limit_req_zone`) throttles abusive IPs; Celery decouples HTTP ACK from processing. |
| **Database Disk Out of Space** | PostgreSQL unable to accept writes | Health checks fail fast; Edge Sync Agent circuit breaker opens, holding records in local SQLite until DB alert clears. |
| **Corrupt / Malformed Punch Payload** | Invalid characters or truncated bytes | Raw payload is preserved in `raw_envelope` with `status = 'CORRUPT_PAYLOAD'`; pipeline continues for valid records. |
| **Biometric Clock Desynchronization** | Terminal battery dies; year resets to 2000 | `BR-DEV-01` flag detects $> 5\text{ min}$ discrepancy; punches quarantined under `CLOCK_DRIFT_WARNING` for admin audit. |
| **Rapid Double Punching by Employee** | Worker scans finger twice in 5 seconds | `BR-PCH-01` Debounce Rule marks second punch as `DUPLICATE_IGNORED`, preserving pairing accuracy. |
