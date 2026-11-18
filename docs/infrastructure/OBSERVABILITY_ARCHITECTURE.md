# APMS Unified Observability Architecture (OpenTelemetry, Prometheus, Grafana, Loki)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** APMS Infrastructure & Observability Engineering

---

## 1. Executive Summary & Observability Strategy

The **APMS (Automated Payroll & Attendance Management System)** operates in a high-stakes, multi-tenant B2B SaaS domain where system anomalies have direct financial and legal consequences:
- Dropped biometric punches lead to incorrect attendance rollups and salary underpayment.
- Unmonitored Celery task queue lag delays punch pairing or blocks month-end payroll execution.
- Silent database connection saturation or Row-Level Security (RLS) context failures could cause tenant data leakage or systemic API timeouts.

To guarantee zero blind spots, APMS implements an **enterprise unified observability architecture** founded on the three open standard pillars—**Metrics, Logs, and Traces**—orchestrated via the **OpenTelemetry (OTel)** framework and visualized through centralized **Grafana Unified Dashboards**.

### 1.1 Non-Negotiable Observability Invariants
1. **End-to-End Correlation**: Every inbound HTTP request, WebSocket event, and background Celery task must propagate an identical `trace_id` and `correlation_id` across logs, metrics, and distributed spans.
2. **Zero PII Exposure in Observability Sinks**: In strict adherence to the DPDP Act 2023, sensitive Personally Identifiable Information (Aadhaar numbers, PAN numbers, bank accounts, base salaries) must be cryptographically redacted or masked at the log formatter layer before reaching Loki or Prometheus.
3. **Tenant-Aware Dimensionality**: Every metric and structured log must carry `tenant_id` as a dimension (except where high-cardinality limits dictate aggregation), allowing instant per-tenant operational isolation and SLA tracking.
4. **Sub-Minute Detection of Hardware Skew**: Clock drift between on-premises biometric terminals and APMS Cloud servers must trigger automated alerts within 60 seconds to prevent corrupted punch pairing.

---

## 2. End-to-End Observability Pipeline Architecture

The flowchart below illustrates the ingestion, transformation, storage, and visualization pipeline across all telemetry streams.

```mermaid
flowchart TD
    subgraph TelemetrySources["1. Telemetry Sources & Ingestion Tier"]
        direction TB
        NGINX["Nginx Reverse Proxy / Ingress\n(Access Logs & Ingress Metrics)"]
        FASTAPI["FastAPI REST & Ingestion Nodes\n(HTTP Requests, Auth & Validation)"]
        CELERY["Celery Asynchronous Workers\n(Pairing, Rollup, Payroll Queues)"]
        CELERY_BEAT["Celery Beat Scheduler\n(Periodic Rollup Triggers)"]
        PG_DB[("PostgreSQL 16 Engine\n(pg_stat_statements & Locks)")]
        REDIS_NODE[("Redis 7 In-Memory\n(Queue Depth & Memory Latency)")]
        EDGE_DAEMON["On-Premises Edge Sync Agent\n(Terminal Heartbeats & Sync Drifts)"]
    end

    subgraph OTelCollector["2. OpenTelemetry Collection Tier"]
        direction TB
        OTEL_AGENT["OTel Collector DaemonSet / Sidecar\n(Receiver: OTLP gRPC/HTTP :4317/:4318)"]
        OTEL_PROC["OTel Processors\n(Batching, Memory Limiter, PII Redaction)"]
        OTEL_ROUTER["OTel Exporters & Routers\n(Metrics, Traces, Structured Logs)"]

        OTEL_AGENT --> OTEL_PROC
        OTEL_PROC --> OTEL_ROUTER
    end

    subgraph StorageBackends["3. Distributed Storage Backends"]
        direction TB
        PROM[("Prometheus / VictoriaMetrics\n(Time-Series Metrics Store)")]
        LOKI[("Grafana Loki\n(Log Indexing & Object Store)")]
        TEMPO[("Grafana Tempo / Jaeger\n(Distributed Tracing Store)")]
    end

    subgraph VisualizationAlerting["4. Visualization & Alerting Tier"]
        direction TB
        GRAFANA["Unified Grafana Dashboards\n(Executive, Hardware, Queues, Payroll)"]
        ALERTMANAGER["Prometheus Alertmanager\n(Alert Routing & De-duplication)"]
        PAGERDUTY["PagerDuty\n(P1/P2 Critical Incidents)"]
        SLACK["Slack / Teams Alert Webhook\n(Operations & Info Channels)"]
        EMAIL_NOTIF["Email / SMS Gateway\n(DevOps On-Call Roster)"]

        ALERTMANAGER --> PAGERDUTY
        ALERTMANAGER --> SLACK
        ALERTMANAGER --> EMAIL_NOTIF
    end

    %% Pipeline Connections
    NGINX -->|OTLP / Syslog| OTEL_AGENT
    FASTAPI -->|OTel Python SDK (Traces & Logs)| OTEL_AGENT
    CELERY -->|OTel Celery Instrumentation| OTEL_AGENT
    CELERY_BEAT -->|Heartbeat Telemetry| OTEL_AGENT
    PG_DB -->|postgres_exporter (Metrics)| PROM
    REDIS_NODE -->|redis_exporter (Metrics)| PROM
    EDGE_DAEMON -->|Telemetry JSON Heartbeats| FASTAPI

    %% OTel Distribution
    OTEL_ROUTER -->|Prometheus Remote Write| PROM
    OTEL_ROUTER -->|OTLP Logs / Promtail| LOKI
    OTEL_ROUTER -->|OTLP Traces (gRPC)| TEMPO

    %% Storage to Presentation
    PROM --> GRAFANA
    LOKI --> GRAFANA
    TEMPO --> GRAFANA
    PROM --> ALERTMANAGER
    LOKI --> ALERTMANAGER
```

---

## 3. Structured JSON Logging Architecture

All APMS applications emit structured JSON logs exclusively to `stdout`, allowing container runtimes and the OpenTelemetry Collector to ingest them with zero disk I/O bottlenecks.

### 3.1 Standardized Log Schema Specification

Every log line must conform to the JSON schema defined below:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "APMSStructuredLogEntry",
  "type": "object",
  "required": [
    "timestamp",
    "level",
    "message",
    "logger",
    "trace_id",
    "span_id",
    "correlation_id",
    "environment"
  ],
  "properties": {
    "timestamp": { "type": "string", "format": "date-time" },
    "level": { "type": "string", "enum": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] },
    "logger": { "type": "string" },
    "message": { "type": "string" },
    "trace_id": { "type": "string" },
    "span_id": { "type": "string" },
    "correlation_id": { "type": "string" },
    "tenant_id": { "type": ["string", "null"] },
    "user_id": { "type": ["string", "null"] },
    "module": { "type": "string" },
    "duration_ms": { "type": "number" },
    "environment": { "type": "string" },
    "extra": { "type": "object" }
  }
}
```

### 3.2 Concrete JSON Log Examples

#### 1. API Inbound Request Log (FastAPI Ingestion Endpoint)
```json
{
  "timestamp": "2026-11-16T10:15:30.145Z",
  "level": "INFO",
  "logger": "app.api.v1.devices",
  "message": "Raw biometric batch ingested successfully from edge sync agent",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "correlation_id": "req-98f23a10-2b44-482a-9cb8-0c3093284f1a",
  "tenant_id": "b1a45749-3172-4d7a-8bfe-30f1d6b052e4",
  "user_id": null,
  "module": "M2_DEVICE_INGESTION",
  "duration_ms": 24.6,
  "environment": "production",
  "extra": {
    "device_serial": "ZK-TF900-MUMBAI-01",
    "batch_size": 45,
    "deduplicated_count": 2,
    "client_ip": "203.0.113.42"
  }
}
```

#### 2. Background Task Execution Log (Celery Punch Pairing)
```json
{
  "timestamp": "2026-11-16T10:15:32.890Z",
  "level": "INFO",
  "logger": "app.modules.pairing.worker",
  "message": "Punch pairing completed for employee shift session",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "5c3b94a8264d12e1",
  "correlation_id": "req-98f23a10-2b44-482a-9cb8-0c3093284f1a",
  "tenant_id": "b1a45749-3172-4d7a-8bfe-30f1d6b052e4",
  "user_id": "emp-e58a983b-930a-4bf2-a3c9-0a8b273b5f10",
  "module": "M4_PAIRING_ENGINE",
  "duration_ms": 12.3,
  "environment": "production",
  "extra": {
    "task_id": "celery-task-83f192b0",
    "queue": "punch_pairing",
    "session_id": "sess-20261116-01",
    "paired_in_time": "2026-11-16T09:02:15+05:30",
    "paired_out_time": "2026-11-16T13:00:20+05:30",
    "worked_minutes": 238
  }
}
```

#### 3. Security Audit Log (RLS Violation Attempt Blocked)
```json
{
  "timestamp": "2026-11-16T10:16:05.012Z",
  "level": "WARNING",
  "logger": "app.core.security.audit",
  "message": "Attempted cross-tenant query blocked by PostgreSQL RLS policy",
  "trace_id": "9a7f3d2155c84ba6e1ce929d0e0e9812",
  "span_id": "11a056bb0fa803c4",
  "correlation_id": "req-12f55a90-3c11-471a-8bb7-1c4091184a2b",
  "tenant_id": "b1a45749-3172-4d7a-8bfe-30f1d6b052e4",
  "user_id": "usr-88a101bc-1234-4567-89ab-cdef01234567",
  "module": "M1_IAM_ORGANIZATION",
  "duration_ms": 8.1,
  "environment": "production",
  "extra": {
    "attempted_target_tenant_id": "c2b56850-4283-4e8b-9cff-41f2e7c163f5",
    "requested_resource": "/api/v1/employees/emp-tenant-b-999",
    "result": "ZERO_ROWS_RETURNED",
    "client_ip": "198.51.100.78"
  }
}
```

---

## 4. Distributed Tracing Architecture (OpenTelemetry & Tempo)

APMS implements W3C TraceContext standards across all synchronous and asynchronous boundaries.

### 4.1 Trace Propagation Across Asynchronous Celery Tasks
When an inbound biometric batch is received via FastAPI, the API generates a trace span and injects the trace headers into the Celery task message payload:

```
[ Web Client / Terminal ]
        |
        v  HTTP Request (Header: traceparent: 00-4bf92f35...-00f067aa...-01)
[ FastAPI Ingestion Endpoint (app.api.v1.devices) ]
        |
        | Span: 'IngestBiometricBatch'
        | Enqueue Celery Task with W3C Headers in kwargs['_otel_context']
        v
[ Redis Task Broker (Queue: punch_pairing) ]
        |
        v
[ Celery Worker Process (app.modules.pairing.worker) ]
        |
        | Extract Trace Context & Create Child Span: 'ExecutePunchPairing'
        v
[ PostgreSQL 16 (SET LOCAL app.current_tenant_id; SELECT ... FOR UPDATE) ]
        |
        | Child Span: 'db.query' (Tagged with SQL Statement & Row Count)
        v
[ Redis Debounce Key Invalidation ]
```

### 4.2 Standard Span Attributes (Tags)
Every span created within APMS is enriched with standardized semantic attributes:
- `apms.tenant_id`: The UUID of the authenticated organization.
- `apms.module`: The functional domain module (e.g. `M4_PAIRING`, `M5_ATTENDANCE`, `M7_PAYROLL`).
- `apms.employee_id`: The target employee UUID (if single-employee scope).
- `apms.pay_run_id`: The payroll run execution identifier (if within payroll pipeline).
- `apms.session_id`: The shift instance session identifier.

---

## 5. Metrics Catalogue & Prometheus Sizing

APMS exports custom Prometheus metrics instrumented using the Prometheus Python client and OpenTelemetry Metrics SDK.

### 5.1 Authoritative Business & Infrastructure Metrics Catalog

| Metric Name | Type | Labels / Dimensions | Description & Threshold |
| :--- | :--- | :--- | :--- |
| **`apms_punches_ingested_total`** | Counter | `tenant_id`, `device_model`, `status` | Cumulative count of incoming biometric punch envelopes. |
| **`apms_biometric_clock_skew_seconds`** | Gauge | `device_serial`, `branch_id`, `tenant_id` | Difference between device hardware clock and server UTC. Skew > 60s triggers alert. |
| **`apms_device_heartbeat_timestamp`** | Gauge | `device_serial`, `branch_id` | Epoch timestamp of last successful heartbeat. Inactive > 5m indicates offline terminal. |
| **`apms_celery_queue_depth`** | Gauge | `queue` (`punch_pairing`, `attendance_rollup`, `payroll_calc`) | Count of pending tasks awaiting worker execution. Depth > 1000 indicates queue lag. |
| **`apms_celery_task_lag_seconds`** | Gauge | `queue` | Time spent by tasks waiting in broker prior to worker execution start. |
| **`apms_celery_task_runtime_seconds`** | Histogram | `task_name`, `queue` | Execution duration distribution of Celery tasks (Buckets: 0.05, 0.25, 1, 5, 30, 120s). |
| **`apms_attendance_pairing_anomalies_total`** | Counter | `tenant_id`, `anomaly_type` | Count of detected punch pairing anomalies (`MISSING_OUT`, `OUT_OF_BOUNDS`, `SPLIT_GAP_VIOLATION`). |
| **`apms_payroll_step_duration_seconds`** | Histogram | `step_number`, `tenant_id` | Execution duration of each step in the 10-step payroll wizard. |
| **`apms_payroll_disbursement_amount_inr`** | Gauge | `tenant_id`, `pay_run_id` | Total computed net pay for a pay run. Used to detect gross calculation anomalies. |
| **`apms_db_pool_connections_active`** | Gauge | `pool_name` (`api`, `worker`) | Active connections checked out of PgBouncer / SQLAlchemy pool. |
| **`apms_db_pool_connections_waiting`** | Gauge | `pool_name` | Number of coroutines queued waiting for an available database connection. |
| **`apms_http_requests_total`** | Counter | `method`, `endpoint`, `status_code` | Inbound REST API request volume by HTTP status. |
| **`apms_http_request_duration_seconds`** | Histogram | `endpoint`, `status_code` | REST API latency distribution (p50, p95, p99 percentiles). |

---

## 6. Unified Grafana Dashboard Catalog

APMS provides five pre-configured, production-ready Grafana dashboards:

### Dashboard 1: APMS Executive & SLA Overview (`apms-executive-sla`)
- **Audience**: CTO, Engineering Leadership, Tenant HR Directors.
- **Panels**:
  - Global Ingestion Throughput (Punches / second across all tenants).
  - API Availability SLA (Current 30-day uptime percentage: Target 99.95%).
  - Active Tenant Count & Active Employee Population.
  - Global Error Budget Burn Rate.
  - Pay Run Execution Summary (Completed pay runs this calendar month).

### Dashboard 2: Biometric Ingestion & Edge Hardware Health (`apms-hardware-biometrics`)
- **Audience**: Hardware Support, Field Operations Engineers.
- **Panels**:
  - Terminal Connectivity Heatmap (Online, Offline > 5m, Critical > 1hr).
  - Biometric Clock Drift Scatter Plot (Identifies devices drifting outside ±60s).
  - Deduplication Rate & Debounce Efficiency (Repeated card taps filtered).
  - Edge Sync Agent Buffer Drain Rates (WAN outage recovery tracking).

### Dashboard 3: Asynchronous Queue & Calculation Engine (`apms-queues-calc`)
- **Audience**: Platform Engineers, SREs.
- **Panels**:
  - Celery Queue Depths by Queue Name (`punch_pairing`, `attendance_rollup`, `payroll_calc`).
  - Worker Pool Concurrency & CPU Utilization.
  - Task Execution Latency percentiles (p50, p95, p99).
  - Dead Letter Queue (DLQ) Volume & Unhandled Task Exceptions.

### Dashboard 4: Statutory Payroll & Calculation Audit (`apms-payroll-audit`)
- **Audience**: Product Operations, Compliance Officers, Lead Architects.
- **Panels**:
  - 10-Step Wizard Execution Duration per Step.
  - Golden Vector Continuous Verification Status.
  - Statutory Ceiling Breakdown (EPF ₹15,000 cap activations vs ESI ₹21,000 gross qualification).
  - Explanation Trace Generation Latency & JSONB Storage Growth.

### Dashboard 5: Multi-Tenant Database & RLS Security (`apms-db-rls-security`)
- **Audience**: Security Team, Database Administrators.
- **Panels**:
  - PgBouncer Client vs Backend Pool Saturation.
  - Database Query Latency & Top 10 Slowest SQL Queries (`pg_stat_statements`).
  - RLS Security Events (Zero-row queries resulting from tenant isolation).
  - Database Table Bloat & Partition Row Distribution (`raw_envelope` partitions).

---

## 7. Critical Prometheus Alerting Rules (`alertmanager.yml`)

The Prometheus alert rules below are deployed into Alertmanager to ensure immediate remediation of operational bottlenecks:

```yaml
groups:
  - name: apms_critical_alerts
    rules:
      # ========================================================================
      # ALERT 1: Biometric Terminal Clock Drift (> 60 Seconds)
      # ========================================================================
      - alert: BiometricClockDriftDetected
        expr: abs(apms_biometric_clock_skew_seconds) > 60
        for: 2m
        labels:
          severity: warning
          tier: hardware
        annotations:
          summary: "Biometric terminal clock skew exceeds 60 seconds"
          description: "Device {{ $labels.device_serial }} at tenant {{ $labels.tenant_id }} has a clock skew of {{ $value }}s. High risk of incorrect attendance pairing."

      # ========================================================================
      # ALERT 2: Celery Punch Pairing Queue Lag High
      # ========================================================================
      - alert: CeleryQueueLagHigh
        expr: apms_celery_queue_depth{queue="punch_pairing"} > 1000
        for: 3m
        labels:
          severity: critical
          tier: platform
        annotations:
          summary: "Punch pairing Celery queue depth exceeded 1000 tasks"
          description: "Queue punch_pairing currently has {{ $value }} pending tasks. Workers are saturated or failing."

      # ========================================================================
      # ALERT 3: Potential Cross-Tenant RLS Bypass Attempt
      # ========================================================================
      - alert: PotentialCrossTenantRLSBypassAttempt
        expr: increase(apms_security_rls_violation_total[5m]) > 0
        for: 0m
        labels:
          severity: critical
          tier: security
        annotations:
          summary: "Cross-tenant RLS query attempted and blocked"
          description: "A query attempted to access rows outside its tenant context at tenant {{ $labels.tenant_id }}."

      # ========================================================================
      # ALERT 4: HTTP 5xx Error Rate Spike
      # ========================================================================
      - alert: Http5xxErrorRateSpike
        expr: >-
          sum(rate(apms_http_requests_total{status_code=~"5.."}[5m]))
          /
          sum(rate(apms_http_requests_total[5m])) * 100 > 1.0
        for: 2m
        labels:
          severity: critical
          tier: api
        annotations:
          summary: "HTTP 5xx server error rate exceeds 1.0%"
          description: "Global API 5xx error rate is currently {{ $value | printf \"%.2f\" }}% over the last 5 minutes."

      # ========================================================================
      # ALERT 5: Database Connection Pool Saturation
      # ========================================================================
      - alert: DatabaseConnectionPoolSaturation
        expr: (apms_db_pool_connections_active / apms_db_pool_connections_max) * 100 > 85
        for: 2m
        labels:
          severity: critical
          tier: database
        annotations:
          summary: "PostgreSQL / PgBouncer connection pool > 85% saturated"
          description: "Database connection pool {{ $labels.pool_name }} is at {{ $value | printf \"%.2f\" }}% utilization."

      # ========================================================================
      # ALERT 6: Disaster Recovery WAL Archiving Stalled
      # ========================================================================
      - alert: DisasterRecoveryWalArchivingStalled
        expr: (time() - apms_backup_last_wal_archive_timestamp) > 900
        for: 3m
        labels:
          severity: critical
          tier: disaster_recovery
        annotations:
          summary: "No PostgreSQL WAL segment archived in over 15 minutes"
          description: "Continuous WAL archiving has stalled. RPO of 15 minutes is at immediate risk of violation."
```

---

## 8. OpenTelemetry Collector Configuration (`otel-collector.yml`)

The production configuration for the OpenTelemetry Collector daemon is specified below:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 1024
    timeout: 5s
  
  memory_limiter:
    check_interval: 1s
    limit_percentage: 75
    spike_limit_percentage: 20

  # Redact PII (Aadhaar, PAN, Bank Details) from Log Messages & Attributes
  transform:
    log_statements:
      - context: log
        statements:
          - replace_pattern(body, "(?i)(aadhaar|pan|bank_account|salary)\\s*[:=]\\s*['\"]?\\w+['\"]?", "$1: [REDACTED]")

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: apms

  otlp/loki:
    endpoint: http://loki:3100/otlp

  otlp/tempo:
    endpoint: http://tempo:4317
    tls:
      insecure: true

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/tempo]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, transform, batch]
      exporters: [otlp/loki]
```
