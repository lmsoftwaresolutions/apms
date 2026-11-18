# APMS Environment Topologies, Infrastructure Matrix & Resource Sizing

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** APMS Infrastructure & Operations Engineering

---

## 1. Executive Summary & Environmental Strategy

The **APMS (Automated Payroll & Attendance Management System)** infrastructure is designed for extreme operational flexibility, allowing identical application code to scale seamlessly from a cost-effective, single-box developer workstation up to an enterprise-grade, multi-region Kubernetes cluster.

To meet both statutory compliance requirements and strict multi-tenant isolation, APMS defines **four distinct environment profiles**:
1. **Local Development (`dev`)**: Lightweight containerized stack optimized for rapid developer feedback, hot-reloading, and offline mocking of biometric hardware terminals.
2. **Staging / QA (`staging`)**: Production-mirrored environment used for end-to-end integration testing, CA golden vector validation, and automated zero-downtime migration rehearsals.
3. **Production Profile XS / S (`prod-compose`)**: Unified single-host Docker Compose deployment serving 1 to 50 tenants (< 10,000 active employees) with minimal operational complexity and low Total Cost of Ownership (TCO).
4. **Production Profile M / L (`prod-k8s`)**: Multi-node Kubernetes enterprise deployment serving 50 to 500+ tenants (50,000 to 500,000+ employees) featuring dedicated compute pools, managed cloud databases with read replicas, high-throughput biometric ingestion nodes, and PgBouncer connection multiplexing.

---

## 2. Global Environment Architecture Diagram

The diagram below illustrates the structural topology across all four deployment tiers, highlighting compute separation, network boundaries, connection pooling, and stateful storage backends.

```mermaid
flowchart TD
    subgraph ClientTier["Client Ingress & Edge Layer"]
        direction LR
        WEB["React 18+ SPA\n(Admin & Employee Portal)"]
        MOB["Mobile App\n(PWA / Mobile GPS Clock-In)"]
        EDGE["Edge Sync Agent\n(Factory LAN Terminals)"]
        DIRECT_BIO["ADMS Hardware Push\n(Cloud-Direct Biometrics)"]
    end

    subgraph EnvDev["1. Local Dev Environment (Docker Compose)"]
        direction TB
        DEV_PROXY["Nginx Reverse Proxy\n(:80 / :443)"]
        DEV_APP["FastAPI API & Workers\n(Hot Reload Mount :8000)"]
        DEV_DB[("PostgreSQL 16 + RLS\n(Local Volume :5432)")]
        DEV_REDIS[("Redis 7 In-Memory\n(Single Instance :6379)")]
        DEV_MINIO[("MinIO Local S3\n(:9000 / :9001)")]

        DEV_PROXY --> DEV_APP
        DEV_APP --> DEV_DB
        DEV_APP --> DEV_REDIS
        DEV_APP --> DEV_MINIO
    end

    subgraph EnvStaging["2. Staging / QA Environment (Pre-Production)"]
        direction TB
        STG_INGRESS["Cloud Ingress Controller\n(TLS 1.3 / Let's Encrypt)"]
        STG_API["FastAPI API Pods\n(2 Replicas)"]
        STG_WORKER["Celery Worker Pods\n(2 Replicas - Shared Queues)"]
        STG_PGBOUNCER["PgBouncer Pooler\n(Transaction Pooling)"]
        STG_DB[("Managed PostgreSQL 16\n(Sanitized Golden Replica)")]
        STG_REDIS[("Managed Redis 7\n(Password Authenticated)")]
        STG_S3[("S3 Staging Bucket\n(Lifecycle: 14 Days)")]

        STG_INGRESS --> STG_API
        STG_API --> STG_PGBOUNCER
        STG_WORKER --> STG_PGBOUNCER
        STG_PGBOUNCER --> STG_DB
        STG_API --> STG_REDIS
        STG_WORKER --> STG_REDIS
        STG_WORKER --> STG_S3
    end

    subgraph EnvProdXS["3. Production Profile XS / S (Docker Compose - 1 to 50 Tenants)"]
        direction TB
        XS_NGINX["Nginx Hardened Proxy\n(Rate Limiting & ModSecurity)"]
        XS_APP["apms-app (FastAPI)\n(4 Uvicorn Workers)"]
        XS_WORKER["apms-worker (Celery)\n(4 Worker Threads)"]
        XS_DB[("PostgreSQL 16 Engine\n(pgdata Volume + WAL Archiving)")]
        XS_REDIS[("Redis 7 Engine\n(AOF Persistence)")]
        XS_MINIO[("MinIO S3 Store\n(Encrypted Payslips Volume)")]

        XS_NGINX --> XS_APP
        XS_APP --> XS_DB
        XS_WORKER --> XS_DB
        XS_APP --> XS_REDIS
        XS_WORKER --> XS_REDIS
        XS_WORKER --> XS_MINIO
    end

    subgraph EnvProdML["4. Production Profile M / L (Kubernetes Enterprise - 50 to 500+ Tenants)"]
        direction TB
        ML_WAF["Cloud WAF / ALB\n(DDoS & Shield Advanced)"]
        
        subgraph K8sCluster["Amazon EKS / Google Cloud GKE"]
            direction TB
            ML_INGEST["apms-ingest Deployment\n(HPA: 5-25 Pods - Biometrics)"]
            ML_API["apms-api Deployment\n(HPA: 4-20 Pods - UI REST)"]
            
            subgraph CeleryPools["Dedicated Celery Worker Pools"]
                W_PAIR["worker-punch-pairing\n(High Priority: 4-16 Pods)"]
                W_ROLL["worker-attendance-rollup\n(Scheduled: 4-12 Pods)"]
                W_PAY["worker-payroll-calc\n(Heavy CPU: 4-16 Pods)"]
                W_RPT["worker-reports-pdf\n(IO Bound: 2-8 Pods)"]
            end
            
            ML_BEAT["apms-beat (Cron Singleton)"]
            ML_PGBOUNCER["PgBouncer StatefulSet\n(3 Replicas - Auto Multiplex)"]
        end

        subgraph CloudDataTier["Managed Cloud Persistence Tier"]
            ML_RDS_PRIMARY[("Amazon Aurora PostgreSQL 16\n(Multi-AZ Writer + RLS)")]
            ML_RDS_REPLICA[("Aurora Read Replicas\n(Reporting & Query Offload)")]
            ML_REDIS_CLUSTER[("AWS ElastiCache Redis Cluster\n(Multi-AZ Failover)")]
            ML_S3[("AWS S3 Encrypted Bucket\n(Object Lock + Cross-Region CRR)")]
        end

        ML_WAF --> ML_INGEST
        ML_WAF --> ML_API
        ML_INGEST --> ML_REDIS_CLUSTER
        ML_API --> ML_REDIS_CLUSTER
        ML_API --> ML_PGBOUNCER
        CeleryPools --> ML_PGBOUNCER
        ML_BEAT --> ML_REDIS_CLUSTER
        ML_PGBOUNCER --> ML_RDS_PRIMARY
        ML_PGBOUNCER -.-> ML_RDS_REPLICA
        CeleryPools --> ML_S3
    end

    %% Client Routing
    ClientTier -->|Localhost| EnvDev
    ClientTier -->|staging.apms.io| EnvStaging
    ClientTier -->|tenant.apms-cloud.com (SMB)| EnvProdXS
    ClientTier -->|enterprise.apms-cloud.com| EnvProdML
```

---

## 3. Infrastructure Sizing & Topology Comparison Matrix

The table below provides a comprehensive architectural and hardware comparison across all four deployment tiers.

| Architectural Dimension | Local Development (`dev`) | Staging / QA (`staging`) | Production Profile XS / S (`prod-compose`) | Production Profile M / L (`prod-k8s`) |
| :--- | :--- | :--- | :--- | :--- |
| **Target Scale** | 1 Mock Tenant (< 50 Users) | 5 Staging Tenants (Sanitized) | 1 – 50 Tenants (< 10k Employees) | 50 – 500+ Tenants (50k – 500k+ Employees) |
| **Orchestration** | Docker Compose v2 | Kubernetes / Compose | Single-Host Docker Compose | Kubernetes 1.29+ (EKS / GKE) |
| **Compute Nodes / Hosts** | 1 Developer Workstation | 2 Virtual Machines | 1 Production Host (e.g. AWS c6i.xlarge) | 6 – 20+ Managed Kubernetes Nodes |
| **Total vCPU Footprint** | 4 – 8 vCPUs (Local) | 8 vCPUs | 4 – 8 vCPUs | 32 – 128+ vCPUs (Autoscaling) |
| **Total RAM Footprint** | 8 – 16 GB (Local) | 16 GB | 16 – 32 GB | 64 – 256+ GB (Autoscaling) |
| **API Compute Tier** | 1 Container (Uvicorn reload) | 2 Pods (FastAPI) | 1 Container (4 Uvicorn workers) | 4 – 20 Pods (HPA on CPU & Latency) |
| **Biometric Ingestion** | Shared via API container | Shared via API pods | Shared via API container | Dedicated `apms-ingest` Pool (5–25 Pods) |
| **Worker Queue Pools** | 1 Worker (Concurrency: 2) | 2 Workers (All queues) | 1 Worker (4 Concurrency, 4 queues) | 4 Segregated Pools (Pairing, Rollup, Payroll, Reports) |
| **Database Engine** | Local PostgreSQL 16 container | Managed RDS Single-AZ | Local PostgreSQL 16 container | Cloud Managed PostgreSQL Multi-AZ (Aurora / Cloud SQL) |
| **Connection Pooling** | Direct asyncpg (Pool: 10) | PgBouncer Container (Pool: 50) | Direct asyncpg (Pool: 20, max_overflow: 10) | PgBouncer Cluster (3 Pods, Transaction Pooling) |
| **Max Concurrent DB Conns** | 50 connections | 150 connections | 100 connections | 2,000+ client conns -> 200 DB backend conns |
| **Task Broker & Cache** | Local Redis 7 (no auth) | Managed Redis 7 Single-Node | Local Redis 7 (AOF + password) | Redis Cluster / ElastiCache Multi-AZ Cluster |
| **Redis Eviction Policy** | `noeviction` | `noeviction` | `noeviction` (Broker) / `volatile-lru` | Segregated Instances: Queue `noeviction`, Cache `volatile-lru` |
| **Object Storage** | Local MinIO container | Cloud S3 Staging Bucket | Local MinIO container | Cloud S3 with KMS Encryption & Cross-Region CRR |
| **Storage Sizing (DB)** | 10 GB NVMe | 50 GB gp3 SSD | 150 – 500 GB gp3 SSD | 1 TB – 10 TB Auto-Expanding NVMe SSD |
| **Backup & WAL Archiving** | Ephemeral / Manual dump | Daily snapshot | Continuous WAL-G to MinIO/S3 + Daily pg_dump | Continuous pgBackRest WAL stream + Daily Snapshots + CRR |
| **SSL / Ingress** | Self-signed / Localhost HTTP | Let's Encrypt / Ingress Nginx | Certbot / Nginx TLS 1.3 | AWS ALB / Ingress Controller + AWS Certificate Manager |
| **Observability Agent** | Local Console / Docker logs | Grafana Agent / Promtail | OTel Collector + Prometheus + Loki | OTel Gateway + Managed Prometheus + Tempo + Loki |
| **Estimated Infra Cost** | $0 (Local hardware) | ~$120 – $250 / month | ~$150 – $350 / month | ~$1,800 – $6,500+ / month |

---

## 4. Detailed Environment Blueprints

### 4.1 Local Development Environment (`dev`)
The local developer environment prioritizes zero-friction onboarding, hot-code reloading, and rapid debugging.

- **Stack**: Single `docker-compose.dev.yml` file.
- **Hot Reloading**: Source code directories (`./app`, `./frontend/src`) mounted as host volumes into container runtimes.
- **Biometric Device Mocking**: Includes an embedded Python mock daemon generating synthetic ADMS biometric clock-in envelopes every 10 seconds.
- **Database Seeding**: Automated bootstrap script `python scripts/seed_dev.py` generating 2 test tenants, 50 employees, 3 shifts, and 30 days of raw punch events.

### 4.2 Staging & QA Environment (`staging`)
The staging environment validates changes under conditions that mirror production without exposing actual employee personally identifiable information (PII).

- **Data Privacy**: Staging databases are populated using anonymized data dumps or synthetic CA-verified golden records. Absolutely zero raw production PII (Aadhaar, PAN, real bank account numbers) is permitted in staging.
- **Ephemeral PR Previews**: Pull requests touching database migrations or frontend interfaces can trigger ephemeral Kubernetes namespace preview environments (`pr-123.staging.apms.io`).
- **Performance Benchmarking**: Nightly automated load tests push 10,000 simulated punches per minute to verify pairing engine throughput and Celery queue drain rates.

### 4.3 Production Profile XS / S (Docker Compose)
Targeted at single-tenant enterprise deployments or multi-tenant operations with up to 50 tenants (< 10,000 active employees).

- **Hardware Profile**: 1x Cloud Compute Instance (e.g. AWS `c6i.xlarge` or Hetzner `CCX23` with 4 vCPUs, 16 GB RAM, 200 GB NVMe storage).
- **Network Boundaries**: Strict Docker bridge network separation: `apms-frontend-net` (public ingress) and `apms-backend-net` (private, non-exposed database/cache network).
- **Process Supervision**: Docker daemon restart policies (`restart: unless-stopped`) with automated container healthcheck scripts.

### 4.4 Production Profile M / L (Kubernetes Enterprise)
Engineered for large multi-site corporations, national retail chains, and high-security defense/healthcare environments with up to 500,000 active employees.

- **Cluster Architecture**: Managed Kubernetes (AWS EKS or GCP GKE) with multiple dedicated worker node groups:
  - `nodegroup-ingress`: Compute-optimized nodes for HTTP/REST and ADMS hardware push ingestion.
  - `nodegroup-workers`: CPU-optimized nodes (e.g. AWS `c6i.2xlarge`) dedicated to heavy Celery batch jobs (payroll wizard, attendance rollup).
  - `nodegroup-stateful`: Memory-optimized nodes running Redis and PgBouncer pods.
- **Horizontal Pod Autoscaling (HPA)**:
  - `apms-api`: Scaled based on average request latency (target p95 < 200ms) and CPU utilization (target 70%).
  - `apms-ingest`: Scaled based on incoming TCP connection count and HTTP request rate from biometric terminals.
  - `worker-punch-pairing`: Scaled dynamically based on Redis queue depth (`apms_celery_queue_depth{queue="punch_pairing"} > 500`).

---

## 5. PostgreSQL Connection Pool & PgBouncer Configuration

Because PostgreSQL creates an operating system process for each connection, high concurrency from hundreds of FastAPI and Celery worker threads can saturate database memory. APMS uses **PgBouncer** in transaction pooling mode.

### 5.1 PgBouncer Invariant: Multi-Tenant RLS Safety
In transaction pooling mode, a client connection is bound to a backend database connection only for the duration of a single database transaction. 

> [!IMPORTANT]
> To prevent cross-tenant data leakage in transaction pooling mode, the tenant context variable MUST be set using `SET LOCAL app.current_tenant_id = '...'` inside an explicit transaction block (`BEGIN ... COMMIT`). When the transaction completes, PostgreSQL automatically clears local session variables, preventing subsequent queries from inheriting a previous tenant's context.

### 5.2 Authoritative `pgbouncer.ini` Configuration

```ini
[databases]
apms_db = host=postgres-primary.internal port=5432 dbname=apms_db auth_user=pgbouncer_auth

[pgbouncer]
logfile = /var/log/pgbouncer/pgbouncer.log
pidfile = /var/run/pgbouncer/pgbouncer.pid

# Network Configuration
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Pooling Strategy
pool_mode = transaction
max_client_conn = 2500
default_pool_size = 80
min_pool_size = 20
reserve_pool_size = 20
reserve_pool_timeout = 5.0
max_db_connections = 120

# Query & Connection Timeouts
server_idle_timeout = 600.0
server_connect_timeout = 15.0
server_login_retry = 1.0
client_idle_timeout = 120.0
client_login_timeout = 60.0
query_timeout = 120.0
idle_transaction_timeout = 30.0

# Security & Compliance
ignore_startup_parameters = extra_float_digits,search_path
application_name_add_host = 1
```

### 5.3 Connection Sizing Formula
The sizing calculation ensures backend database connections never exceed PostgreSQL's `max_connections`:
$$\text{Max Backend DB Connections} = (\text{default\_pool\_size} + \text{reserve\_pool\_size}) \times \text{PgBouncer Pod Count}$$
$$\text{Example (Profile M/L)}: (80 + 20) \times 2 = 200 \le \text{PostgreSQL max\_connections (250)}$$

---

## 6. Redis Memory Policies, Partitioning & Persistence

Redis is a critical shared infrastructure component serving two fundamentally distinct workloads:
1. **Durable Task Broker**: Celery queues (`punch_pairing`, `attendance_rollup`, `payroll_calc`, `default`).
2. **Volatile In-Memory Cache**: Rate limiting, JWT session blacklist, and punch deduplication debounce keys.

### 6.1 Redis Instance Segregation (Profile M / L)
In enterprise deployments, these workloads are partitioned across separate Redis clusters to prevent cache spikes from evicting background tasks:

```
+-------------------------------------------------------------------------+
| Redis Cluster #1: Task Queue Broker (Durable)                           |
| - Max Memory Policy: noeviction (Never evict unconsumed tasks!)        |
| - Persistence: AOF enabled (appendfsync everysec) + RDB snapshots      |
| - Memory Sizing: 16 GB to 32 GB RAM                                     |
+-------------------------------------------------------------------------+
| Redis Cluster #2: Application Cache & Idempotency (Volatile)            |
| - Max Memory Policy: volatile-lru / allkeys-lru                        |
| - Persistence: Disabled (Pure in-memory transient data)                |
| - Memory Sizing: 8 GB to 16 GB RAM                                      |
+-------------------------------------------------------------------------+
```

### 6.2 Authoritative `redis.conf` Configuration (Task Queue Broker)

```ini
# Network & Binding
bind 0.0.0.0
protected-mode yes
port 6379
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Memory Management (Non-Negotiable Task Durability)
maxmemory 16gb
maxmemory-policy noeviction

# Persistence: Hybrid RDB + Append Only File (AOF)
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis/data

appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite yes
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Security
requirepass SuperSecretRedisClusterPassword123!
```

---

## 7. Storage Sizing & Capacity Planning

Because APMS retains immutable punch records, daily rollups, and audit explanation traces, storage sizing must account for steady-state data growth over an **8-year statutory retention horizon**.

### 7.1 Relational Data Growth Projections (Per 10,000 Employees)
- **Raw Biometric Punches (`raw_envelope`)**:
  - Punches per employee per day: $4\text{ punches} \times 1.2\text{ (retries/sync)} = 4.8\text{ punches/day}$
  - Daily punches for 10,000 employees: $48,000\text{ records/day}$
  - Storage footprint per row (JSON payload + metadata): $\approx 1.5\text{ KB}$
  - Daily punch storage: $72\text{ MB/day} \implies \mathbf{26.3\text{ GB/year}}$
- **Daily Attendance Summaries & Explanation Traces (`daily_attendance_summary`)**:
  - 10,000 employees $\times 365\text{ days} = 3,650,000\text{ records/year}$
  - Average row size with JSONB explanation trace: $\approx 2.5\text{ KB}$
  - Annual rollup storage: $\mathbf{9.1\text{ GB/year}}$
- **Monthly Payroll Snapshots & Payslips (`pay_run_employee_snapshots`)**:
  - 10,000 employees $\times 12\text{ months} = 120,000\text{ snapshots/year}$
  - Average row size with tax calculation breakdown: $\approx 4\text{ KB}$
  - Annual payroll database storage: $\mathbf{0.48\text{ GB/year}}$
- **Total Relational Growth (10,000 employees)**: $\approx \mathbf{36\text{ GB/year}}$ (excluding indexes and WAL).

### 7.2 Object Storage Sizing (MinIO / S3 Payslips & Exports)
- Generated payslip PDFs are cryptographically signed and stored in S3/MinIO.
- Average PDF size: $\approx 120\text{ KB}$
- Annual PDF generation: $120,000\text{ PDFs} \times 120\text{ KB} = \mathbf{14.4\text{ GB/year}}$ per 10,000 employees.
- 8-Year statutory storage requirement: $\approx \mathbf{115.2\text{ GB}}$ per 10,000 employees.

---

## 8. Network Topology, Security Groups & Firewalls

APMS enforces a zero-trust network boundary across all environments:

```
[ Public Internet ]
        |
        v  HTTPS (TCP 443 Only)
[ AWS ALB / Nginx Reverse Proxy ]
        |
        | Private Subnet (10.0.1.0/24)
        v  HTTP (TCP 8000)
[ FastAPI API & Ingest Pods ]
        |
        +-----------------------------------+
        |                                   |
        | Private Subnet (10.0.2.0/24)     | Private Subnet (10.0.3.0/24)
        v  TCP 6432                         v  TCP 6379
[ PgBouncer Connection Pooler ]     [ Redis Cluster ]
        |
        v  TCP 5432
[ Amazon Aurora PostgreSQL 16 ]
```

- **Inbound Rules**: Only TCP port 443 (HTTPS) and port 80 (redirect to HTTPS) are open to public IP ranges.
- **Database Isolation**: PostgreSQL and PgBouncer listen exclusively on private VPC subnets. Direct ingress from the public Internet is blocked at the routing layer.
- **Egress Rules**: Application pods have outbound access restricted to designated cloud services (S3 endpoints, AWS KMS, SMS/WhatsApp notification gateways) via NAT Gateways.
