# APMS On-Premises Edge Sync Agent Specification

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Executive Summary & Purpose

The **APMS On-Premises Edge Sync Agent** is an autonomous, lightweight daemon engineered for deployment on local networks at manufacturing plants, hospitals, warehouse facilities, remote branch offices, and construction sites.

Biometric hardware terminals frequently operate in environments characterized by intermittent or unreliable Internet connectivity, power instability, and legacy firmware protocols that lack native support for modern cloud security standards (TLS 1.3, JWT, HMAC signatures). 

The Edge Sync Agent bridges this divide by providing:
1. **Universal Protocol Adaptability**: Native termination of **ZKTeco ADMS push**, **eTimeOffice HTTP pull**, and local RS485/TCP polling.
2. **7-Day Air-Gapped Offline Resilience**: Zero punch loss during prolonged WAN outages via an embedded, high-performance SQLite FIFO buffer.
3. **Outbound-Only Cloud Connectivity**: No open inbound ports required on the customer firewall; pushes to APMS Cloud over HTTPS/TLS 1.3.
4. **Guaranteed Raw Immutability**: All hardware punch payloads are preserved byte-for-byte and relayed to `raw_envelope` with cryptographic SHA-256 signatures.

---

## 2. On-Premises Edge Deployment Architecture

```mermaid
flowchart TD
    subgraph OnPremisesSite["On-Premises Physical Location (Factory / Branch LAN)"]
        direction TB

        subgraph HardwareTerminals["Hardware Biometric Terminals"]
            ZK1["ZKTeco ADMS Terminal #1\n(Factory Gate 1 - Turnstile)"]
            ZK2["ZKTeco ADMS Terminal #2\n(Shop Floor Ingress)"]
            ET1["eTimeOffice / eSSL Terminal\n(Admin Building)"]
            USB1["Legacy RS485 / USB Device\n(Security Cabin)"]
        end

        subgraph EdgeAgent["APMS Edge Sync Agent (Local Windows / Linux Daemon)"]
            direction TB

            subgraph ProtocolListeners["Protocol Ingestion Adapters"]
                ADMS_RECV["ADMS Push Receiver\n(HTTP Server :8080)"]
                ET_PULL["eTimeOffice HTTP Poller\n(Cron Polling Service)"]
                SERIAL_POLL["Legacy RS485 / Serial SDK Poller"]
            end

            subgraph StorageEngine["Local Offline Durability Engine"]
                VALIDATOR["Payload Sanity & Hash Generator\n(SHA-256 Fingerprint)"]
                SQLITE[("Local Embedded SQLite Buffer\n(7-Day Rolling Storage - WAL Mode)\n[edge_buffer.db]")]
                FIFO_MGR["FIFO Queue & Reconnection Manager"]
            end

            subgraph PushRelay["Cloud Synchronization Relay"]
                CIRCUIT_BREAKER["Circuit Breaker & Backoff Controller"]
                BATCH_DISPATCH["HTTPS Batch Dispatcher\n(TLS 1.3 / mTLS Client)"]
                HEARTBEAT["Telemetry & Heartbeat Daemon\n(60s Heartbeat - DEV-02)"]
            end
        end

        FIREWALL["Local Router / Firewall\n(Outbound Port 443 Only - Zero Inbound Rules)"]
    end

    subgraph APMSCloud["APMS Cloud Multi-Tenant Platform"]
        direction TB
        CLOUD_INGRESS["Nginx Reverse Proxy / Cloud Ingress\n(:443 HTTPS / TLS 1.3)"]
        FASTAPI["FastAPI Ingestion Endpoint\nPOST /api/v1/devices/push"]
        AUTH_VAL["Device Auth & Tenant Resolver\n(Token + SHA-256 Check)"]
        RAW_TABLE[("raw_envelope\n(Append-Only / Partitioned Table)")]
        NORM_SERVICE["Normalization & Deduplication Worker\n(Debounce Window & Clock Drift Check)"]
        PUNCH_STREAM[("punch_event\n(Normalized Stream)")]
    end

    %% Terminal Connections to Adapters
    ZK1 -->|HTTP POST ADMS Push| ADMS_RECV
    ZK2 -->|HTTP POST ADMS Push| ADMS_RECV
    ET_PULL -->|HTTP GET Log Fetch| ET1
    SERIAL_POLL -->|RS485 / TCP 4370 SDK| USB1

    %% Internal Agent Data Flow
    ADMS_RECV --> VALIDATOR
    ET_PULL --> VALIDATOR
    SERIAL_POLL --> VALIDATOR

    VALIDATOR -->|Immediate Commit| SQLITE
    SQLITE --> FIFO_MGR
    FIFO_MGR --> CIRCUIT_BREAKER
    CIRCUIT_BREAKER --> BATCH_DISPATCH
    HEARTBEAT -.->|Status Pings| BATCH_DISPATCH

    %% Outbound Cloud Transmission
    BATCH_DISPATCH -->|HTTPS / 443| FIREWALL
    FIREWALL -->|"WAN / Internet (mTLS)"| CLOUD_INGRESS

    %% Cloud Ingestion Flow
    CLOUD_INGRESS --> FASTAPI
    FASTAPI --> AUTH_VAL
    AUTH_VAL -->|Byte-for-Byte Insert| RAW_TABLE
    RAW_TABLE --> NORM_SERVICE
    NORM_SERVICE --> PUNCH_STREAM
```

---

## 3. Synchronization Flow & Offline Recovery Sequences

### 3.1 Normal Online Real-Time Synchronization Flow

Under healthy network conditions, punches are acknowledged locally and pushed to the cloud in sub-second latency:

```mermaid
sequenceDiagram
    autonumber
    participant Terminal as Biometric Terminal (ZKTeco)
    participant Edge as Edge Sync Agent Daemon
    participant SQLite as Local SQLite Buffer
    participant Cloud as APMS Cloud API (/api/v1/devices/push)
    participant DB as PostgreSQL (raw_envelope)

    Terminal->>Edge: HTTP POST /iclock/cdata?SN=ZK998&table=ATTLOG (Raw Punch)
    activate Edge
    Edge->>Edge: Compute SHA-256 payload hash
    Edge->>SQLite: INSERT INTO local_punch_buffer (status='PENDING', payload, hash)
    Edge-->>Terminal: HTTP 200 OK ("POST: OK")
    deactivate Edge

    Edge->>Cloud: POST /api/v1/devices/push<br/>Headers: [X-Device-Serial, X-Device-Token, X-Payload-Hash]<br/>Body: { punches: [ ... ] }
    activate Cloud
    Cloud->>Cloud: Verify X-Device-Token & Tenant ID
    Cloud->>Cloud: Verify SHA-256(Body) == X-Payload-Hash
    Cloud->>DB: INSERT INTO raw_envelope (tenant_id, device_id, raw_payload, payload_hash)
    DB-->>Cloud: 201 Created
    Cloud-->>Edge: HTTP 200 OK { success: true, processed: 1 }
    deactivate Cloud

    Edge->>SQLite: UPDATE local_punch_buffer SET status='SYNCED', synced_at=NOW() WHERE id=:id
```

---

### 3.2 Offline WAN Outage & Automatic Recovery Reconciliation

When WAN connectivity fails, the agent isolates the failure, buffers all events without terminal disruption, and recovers chronologically once connectivity returns:

```mermaid
sequenceDiagram
    autonumber
    participant Terminal as Biometric Terminal
    participant Edge as Edge Sync Agent
    participant SQLite as Local SQLite Buffer
    participant WAN as Internet / WAN Boundary
    participant Cloud as APMS Cloud API

    Note over Terminal,Cloud: WAN Connection Dropped / Fiber Cut / ISP Down
    Terminal->>Edge: HTTP POST /iclock/cdata (Punch Clock-In)
    activate Edge
    Edge->>SQLite: INSERT INTO local_punch_buffer (status='PENDING', payload, hash)
    Edge-->>Terminal: HTTP 200 OK ("POST: OK")
    
    Edge->>WAN: HTTPS POST /api/v1/devices/push
    WAN--xEdge: Network Timeout / Connection Refused (ECONNREFUSED)
    Edge->>Edge: Trip Circuit Breaker -> State: OPEN
    Edge->>SQLite: UPDATE local_punch_buffer SET status='OFFLINE_BUFFERED'
    deactivate Edge

    Note over Terminal,SQLite: Outage Continues: Thousands of Punches Safely Buffered (Up to 7 Days)
    Terminal->>Edge: Batch punches from shifts & breaks
    Edge->>SQLite: Appends to SQLite (WAL Mode, zero data corruption)
    Edge-->>Terminal: HTTP 200 OK

    Note over Edge,Cloud: WAN Restored / Internet Connection Returns
    loop Reconnection Health Ping (Exponential Backoff + Jitter)
        Edge->>Cloud: HEAD /api/v1/health (Probe Ping)
        Cloud-->>Edge: HTTP 200 OK (Connection Healthy)
    end

    Note over Edge,Cloud: Recovery Reconciliation: Strict FIFO Chronological Batching
    Edge->>SQLite: SELECT * FROM local_punch_buffer WHERE status='OFFLINE_BUFFERED' ORDER BY id ASC LIMIT 500
    SQLite-->>Edge: Batch of 500 Punches

    Edge->>Cloud: POST /api/v1/devices/push (Batch Payload + SHA-256 Digest)
    activate Cloud
    Cloud->>Cloud: Deduplicate against raw_envelope (idempotent hash check)
    Cloud->>Cloud: Ingest to raw_envelope & trigger out-of-order recalculation
    Cloud-->>Edge: HTTP 200 OK { synced: 500, status: "RECONCILED" }
    deactivate Cloud

    Edge->>SQLite: UPDATE local_punch_buffer SET status='SYNCED' WHERE id IN (...)
    Note over Edge: State transitions to CLOSED (Normal Real-Time Mode)
```

---

## 4. Supported Biometric Hardware Protocols

### 4.1 ZKTeco ADMS (Automatic Data Master Server) Push Protocol
The ZKTeco ADMS protocol is an HTTP-based push protocol embedded in ZKTeco firmware:

1. **Heartbeat & Initialization Handshake**:
   - **Request**: `GET /iclock/cdata?SN={SERIAL_NUMBER}&options=all&pushver=2.4.1`
   - **Response**:
     ```text
     GET OPTION FROM: {SERIAL_NUMBER}
     Stamp=9999
     OpStamp=9999
     PhotoStamp=9999
     TransTimes=00:00;14:05
     TransInterval=1
     TransTables=User Transaction
     Realtime=1
     Encrypt=0
     ServerVersion=3.1.1
     ```
2. **Real-Time Punch Event Payload (`ATTLOG`)**:
   - **Request**: `POST /iclock/cdata?SN={SERIAL_NUMBER}&table=ATTLOG&Stamp={STAMP}`
   - **Payload Format (Tab-Separated Record Format)**:
     ```text
     10045	2026-11-16 08:58:24	1	1	0	0	0
     10082	2026-11-16 09:01:12	1	1	0	0	0
     ```
     *Fields: `[PIN / Badge] [Timestamp: YYYY-MM-DD HH:MM:SS] [Punch State: 0=Check-In, 1=Check-Out] [Verify Type: 1=Fingerprint, 15=Face] [Work Code] [Reserved] [Reserved]`*
   - **Response**: `OK` or `POST: OK\n`

### 4.2 eTimeOffice / eSSL HTTP Pull Protocol
For devices communicating through on-premises Web APIs or cloud pollers:
- **Polling Interval**: Configurable (Default: 30 seconds).
- **Endpoint**: `GET /api/public/v1/devices/{sn}/logs?since={last_log_id}`
- **Response Format**: JSON array parsed into raw string envelopes.
- **Cursor Tracking**: Local SQLite stores `high_water_mark_id` to guarantee zero skipped logs.

### 4.3 Legacy RS485 / Serial / Standalone SDK Poller
- Supports legacy terminals via Windows DLL (`zkemkeeper.dll`) or Linux CFFI socket client (`pyzk`).
- Interrogates terminals via TCP port 4370 at regular intervals:
  ```python
  zk.connect()
  zk.disable_device()
  logs = zk.get_attendance()
  zk.enable_device()
  ```

---

## 5. Offline Durability & Local Storage Architecture

### 5.1 Local SQLite Schema (`edge_buffer.db`)

The agent embeds a lightweight SQLite database engineered for zero maintenance:

```sql
CREATE TABLE local_punch_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_sn VARCHAR(64) NOT NULL,
    raw_payload TEXT NOT NULL,
    payload_hash VARCHAR(64) NOT NULL UNIQUE,
    event_time DATETIME NOT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, OFFLINE_BUFFERED, SYNCED, FAILED
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    synced_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_buffer_status_id ON local_punch_buffer(sync_status, id);
CREATE INDEX idx_buffer_event_time ON local_punch_buffer(event_time);
```

### 5.2 Storage Capacity & Sizing Analysis (7-Day Rolling Buffer)
- **Workforce Scenario**: Large manufacturing plant with 5,000 workers.
- **Punch Volume**: 4 punches per employee per day (In, Break Out, Break In, Out) = 20,000 punches/day.
- **7-Day Outage Footprint**: $20,000 \times 7 = 140,000 \text{ records}$.
- **Disk Utilization**:
  - Raw record size: ~200 bytes.
  - Total SQLite file size for 140,000 records + B-Tree indexes: **~35 MB**.
  - **Headroom**: A standard 16 GB flash storage provides over 3 years of buffer storage capacity.

### 5.3 Write-Ahead Logging (WAL) Configuration
To ensure zero database corruption during sudden factory power outages, SQLite is initialized with:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB Cache
PRAGMA busy_timeout = 5000;
```

---

## 6. Resilience & Reconnect Strategy

When network failures occur, the Edge Agent avoids thundering-herd problems and API saturation using a deterministic state machine:

```mermaid
stateDiagram-v2
    [*] --> Closed_Online

    Closed_Online --> Open_Offline : HTTP Push Failure / Timeout (3 consecutive fails)
    Open_Offline --> Open_Offline : Buffer punches to SQLite; Increment retry count
    Open_Offline --> HalfOpen_Probe : Health probe succeeds after backoff window
    
    HalfOpen_Probe --> Open_Offline : Probe fails or batch rejected
    HalfOpen_Probe --> Flushing_Buffer : Batch of 500 accepted
    
    Flushing_Buffer --> Flushing_Buffer : Replaying FIFO chunks (500 records/sec)
    Flushing_Buffer --> Closed_Online : Buffer fully drained (pending_count == 0)
```

### 6.1 Exponential Backoff with Jitter Formulation
The wait interval between connection probes is calculated as:
$$T_{\text{wait}} = \min(T_{\text{max}}, T_{\text{base}} \times 2^{\text{retry}}) \pm \text{RandomJitter}$$
- $T_{\text{base}} = 5 \text{ seconds}$
- $T_{\text{max}} = 300 \text{ seconds}$ (5 minutes)
- $\text{Jitter} \in [0, 5] \text{ seconds}$

---

## 7. Security, Integrity & Immutability Standards

1. **Mutual TLS (mTLS) & TLS 1.3**:
   - All WAN communication enforces TLS 1.3 with pinned server certificates.
   - Optional client certificate authentication for high-security defense and banking tenants.

2. **Per-Device Provisioning & Secret Token**:
   - Each hardware terminal has a cryptographically random 256-bit token generated in the APMS Cloud console.
   - Injected in HTTP headers:
     - `X-Device-Serial: ZK-BLR-FAC1-09`
     - `X-Device-Token: tok_live_9f83ac04e28...`
     - `X-Payload-Hash: sha256_hex_digest`

3. **Raw Payload Immutability**:
   - The Edge Agent **never parses, modifies, rounds, or adjusts** timestamps or employee IDs.
   - Raw bytes received from the biometric device are transmitted byte-for-byte to the cloud `raw_envelope` table.

4. **Credential Protection at Rest**:
   - On Windows: API keys and database encryption keys are secured via Windows Data Protection API (DPAPI).
   - On Linux: Secured via Linux Keyutils / Kernel Keyring.

---

## 8. Telemetry & Heartbeat Specifications (`DEV-02`)

The Edge Agent transmits a telemetry heartbeat every 60 seconds to `POST /api/v1/devices/heartbeat`:

```json
{
  "device_serial": "ZK-BLR-FAC1-09",
  "agent_version": "2.4.0",
  "status": "HEALTHY",
  "clock_drift_seconds": 1.2,
  "system_metrics": {
    "cpu_percent": 3.4,
    "memory_mb": 42.1,
    "disk_free_mb": 14200
  },
  "buffer_metrics": {
    "total_buffered": 0,
    "synced_past_24h": 18450,
    "last_sync_timestamp": "2026-11-16T10:48:22Z"
  }
}
```
*If `clock_drift_seconds` exceeds $\pm 300\text{ seconds}$ (5 minutes), the APMS cloud raises an immediate high-priority maintenance ticket for NTP hardware re-synchronization.*
