# APMS Docker Compose Architecture (Profile XS / S)

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Extracted from APMS documentation

---

## 1. Executive Summary & Topology Scope

The **APMS (Automated Payroll & Attendance Management System)** deployment architecture is designed to accommodate workloads scaling from single-site small-to-medium businesses (Profile XS / S) up to large multi-tenant enterprise deployments (Profile M / L).

- **Profile XS / S Target**: Deployments serving 1 to 50 tenants with fewer than 10,000 active employees.
- **Topology**: Unified single-host container orchestration using **Docker Compose**.
- **Core Principle**: Operational simplicity, low overhead, and deterministic service dependencies while maintaining strict multi-tenant Row-Level Security (RLS) and architectural separation between synchronous REST traffic and asynchronous queue workloads.

---

## 2. Docker Compose Container Architecture Diagram

The diagram below illustrates the container layout, network partitioning, storage mounts, host port bindings, and external client access boundaries for Profile XS / S.

```mermaid
flowchart TD
    subgraph HostBoundary["Host Environment (Linux / Windows Server)"]
        direction TB

        subgraph IngressPorts["Exposed Host Ports"]
            P80["Port 80/tcp (HTTP -> HTTPS Redirect)"]
            P443["Port 443/tcp (HTTPS / TLS 1.3)"]
            P9000["Port 9000/tcp (MinIO Console / S3 - Optional Admin)"]
        end

        subgraph DockerNetworks["Docker Isolated Network Namespaces"]
            direction TB

            subgraph FrontendNet["Network: apms-frontend-net (Bridge)"]
                NGINX["nginx:alpine\n(Reverse Proxy & TLS Termination)\n[Ports: 80, 443]"]
            end

            subgraph BackendNet["Network: apms-backend-net (Internal Bridge - No Direct Host Exposure)"]
                API["apms-app\n(FastAPI / Uvicorn Async Server)\n[Port: 8000]"]
                WORKER["apms-worker\n(Celery Background Worker)\n[Concurrency: 4 Workers]"]
                DB[("postgres:16-alpine\n(PostgreSQL Database + RLS)\n[Port: 5432]")]
                REDIS[("redis:7-alpine\n(Task Broker & Cache)\n[Port: 6379]")]
                MINIO[("minio/minio:latest\n(S3-Compatible Object Store)\n[Ports: 9000 API, 9001 Console]")]
            end
        end

        subgraph PersistentVolumes["Host Volume Mounts / Named Volumes"]
            VOL_PG[("Volume: pgdata\n/var/lib/postgresql/data")]
            VOL_REDIS[("Volume: redisdata\n/data (AOF/RDB)")]
            VOL_MINIO[("Volume: miniodata\n/data (Buckets: payslips, exports)")]
            VOL_LOGS[("Volume / Host Bind: applogs\n/var/log/apms")]
        end

        subgraph ConfigInjection["Environment & Secret Injection (.env)"]
            ENV_DB["DATABASE_URL\nPOSTGRES_DB / USER / PASSWORD\nDB_POOL_SIZE=20"]
            ENV_REDIS["REDIS_URL=redis://redis:6379/0\nCELERY_BROKER_URL"]
            ENV_SEC["ENCRYPTION_MASTER_KEY (AES-256)\nJWT_SECRET / JWT_ALGORITHM"]
            ENV_S3["S3_ENDPOINT_URL\nS3_ACCESS_KEY / S3_SECRET_KEY\nS3_BUCKET_NAME=apms-payslips"]
        end
    end

    %% External Clients
    CLIENT_WEB["React 18+ Web Client (SPA)"] -->|HTTPS / 443| P443
    CLIENT_MOB["Mobile App (PWA / Flutter)"] -->|HTTPS / 443| P443
    CLIENT_EDGE["On-Premises Edge Sync Agent"] -->|HTTPS / 443| P443
    ADMIN_USER["System Administrator"] -->|HTTPS / 9000| P9000

    %% Ingress routing
    P80 -->|Redirect 301| NGINX
    P443 -->|TLS Termination| NGINX
    P9000 -->|Direct Ingress / Proxy| MINIO

    %% Reverse Proxy Traffic
    NGINX -->|Route: /api/v1/*\nProxy Pass: http://apms-app:8000| API
    NGINX -->|Route: /s3/*\nProxy Pass: http://minio:9000| MINIO

    %% Backend Service Interactions
    API -->|"Async Connection Pool (asyncpg)\nSET LOCAL app.current_tenant_id"| DB
    API -->|Enqueue Jobs / Rate Limiting| REDIS
    API -->|Upload / Download PDFs & Templates| MINIO
    API -.->|Writes Logs| VOL_LOGS

    WORKER -->|Async Task Processing\nPairing, Rollup, Payroll, Reports| DB
    WORKER -->|Task Queue Subscription & Results| REDIS
    WORKER -->|Store Generated Payslip PDFs| MINIO
    WORKER -.->|Writes Logs| VOL_LOGS

    %% Storage bindings
    DB --- VOL_PG
    REDIS --- VOL_REDIS
    MINIO --- VOL_MINIO

    %% Env bindings
    ENV_DB -.-> DB
    ENV_DB -.-> API
    ENV_DB -.-> WORKER
    ENV_REDIS -.-> API
    ENV_REDIS -.-> WORKER
    ENV_SEC -.-> API
    ENV_SEC -.-> WORKER
    ENV_S3 -.-> API
    ENV_S3 -.-> WORKER
```

---

## 3. Service Breakdown & Container Roles

| Service Name | Base Container Image | Internal Port | Exposed Host Port | Network Attachment | Role & Execution Boundary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`nginx`** | `nginx:1.25-alpine` | `80`, `443` | `80`, `443` | `apms-frontend-net`, `apms-backend-net` | Edge reverse proxy, TLS 1.3 termination, HTTP/2 termination, rate-limiting (`ngx_http_limit_req_module`), static asset caching, and security header injection. |
| **`apms-app`** | `apms/backend:latest` (Python 3.12-slim) | `8000` | *None (Internal)* | `apms-backend-net` | Core FastAPI asynchronous REST API service. Handles authentication, organization management, ingestion endpoints (`/api/v1/devices/push`), shifts, attendance queries, and payroll wizard execution. |
| **`apms-worker`** | `apms/backend:latest` (Python 3.12-slim) | *None* | *None* | `apms-backend-net` | Asynchronous Celery / ARQ worker daemon. Consumes background jobs: chronological punch pairing (`M4`), daily attendance rollup (`M5`), 10-step payroll runs (`M7`), and bulk PDF generation. |
| **`postgres`** | `postgres:16-alpine` | `5432` | *Optional (5432 for maintenance only)* | `apms-backend-net` | Multi-tenant relational persistence. Enforces Row-Level Security (RLS) on `tenant_id`, declarative range partitioning on `raw_envelope` and `punch_event`, and JSONB explanation trace storage. |
| **`redis`** | `redis:7-alpine` | `6379` | *None (Internal)* | `apms-backend-net` | In-memory datastore. Acts as Celery task message broker, task results backend, high-speed idempotency cache (punch deduplication debounce), and sliding-window rate limiter. |
| **`minio`** | `minio/minio:latest` | `9000`, `9001` | `9000` *(Console optional: 9001)* | `apms-backend-net`, `apms-frontend-net` | S3-compatible private object storage. Houses encrypted payslip PDF artifacts (`pay_run_employee_snapshots.payslip_pdf_url`), statutory export files, and biometric sync logs. |

---

## 4. Network Segregation & Security Boundaries

Docker Compose implements two distinct bridge networks to enforce zero-trust isolation between Internet-facing entrypoints and internal stateful data tiers:

1. **`apms-frontend-net` (Public Facing)**:
   - Contains only the `nginx` reverse proxy and optional MinIO admin ingress.
   - Accepts external TCP traffic on ports 80 (HTTP) and 443 (HTTPS).
   - Isolates client-side SSL handshakes and DDoS/flooding from core application layers.

2. **`apms-backend-net` (Internal Isolated Network)**:
   - Contains `apms-app`, `apms-worker`, `postgres`, `redis`, and `minio`.
   - **No external port mappings**: Database (`5432`), Redis (`6379`), and FastAPI (`8000`) cannot be accessed from outside the host machine.
   - Internal DNS resolution allows containers to resolve peers via service names: `postgres`, `redis`, `minio`, `apms-app`.

---

## 5. Storage Architecture & Persistent Volumes

All persistent state is mapped to isolated Docker named volumes or host-bound paths to survive container recycles and upgrades:

- **`pgdata` (`/var/lib/postgresql/data`)**:
  - PostgreSQL 16 database cluster directory.
  - Configured with PostgreSQL Write-Ahead Logging (WAL) level `replica` for point-in-time recovery.
- **`redisdata` (`/data`)**:
  - Redis append-only persistence file (`appendonly.aof`) and snapshot (`dump.rdb`).
- **`miniodata` (`/data`)**:
  - Object store bucket filesystem. Buckets:
    - `apms-payslips`: Secure cryptographic PDF payslips.
    - `apms-exports`: Bank disbursement files (NEFT/RTGS CSV) and Tally XML vouchers.
    - `apms-audit`: Archival export bundles.
- **`applogs` (`/var/log/apms`)**:
  - Centralized log storage mapped to host filesystem for log rotation (`logrotate`) and forwarding to SIEM/Grafana Loki.

---

## 6. Environment Variable & Secret Injection Reference

All runtime credentials and configuration keys are injected using a single, protected `.env` file with strict POSIX permissions (`chmod 600 .env`).

```ini
# ==============================================================================
# APMS Environment Configuration (Profile XS / S)
# ==============================================================================

# Core System Environment
APP_ENV=production
LOG_LEVEL=info
TZ=Asia/Kolkata

# Security & Cryptography (Non-Negotiable)
JWT_SECRET=c8f8b1c2e4d6a8f09123456789abcdef0123456789abcdef0123456789abcdef
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
# Field-Level Envelope Encryption Key (AES-256 32-byte hex for Aadhaar, PAN, Bank, Salary)
ENCRYPTION_MASTER_KEY=4a7b9c0e2f1a3d5e7b9c0e2f1a3d5e7b9c0e2f1a3d5e7b9c0e2f1a3d5e7b9c0e

# PostgreSQL Database Configuration
POSTGRES_DB=apms_db
POSTGRES_USER=apms_user
POSTGRES_PASSWORD=SuperSecretComplexPostgresPassw0rd!
DATABASE_URL=postgresql+asyncpg://apms_user:SuperSecretComplexPostgresPassw0rd!@postgres:5432/apms_db
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=10

# Redis Cache & Task Queue
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# MinIO / S3 Object Storage
S3_ENDPOINT_URL=http://minio:9000
S3_ACCESS_KEY=apms_minio_admin
S3_SECRET_KEY=SuperSecretMinioPassword123!
S3_BUCKET_NAME=apms-payslips
S3_REGION=us-east-1

# Reverse Proxy & Host Domains
DOMAIN_NAME=apms.yourcompany.com
ACME_EMAIL=admin@yourcompany.com
```

---

## 7. Production Docker Compose Manifest (`docker-compose.yml`)

The authoritative single-box Compose file for Profile XS / S is defined below:

```yaml
version: '3.8'

networks:
  apms-frontend-net:
    driver: bridge
  apms-backend-net:
    driver: bridge
    internal: false

volumes:
  pgdata:
    name: apms_pgdata
  redisdata:
    name: apms_redisdata
  miniodata:
    name: apms_miniodata
  applogs:
    name: apms_applogs

services:
  nginx:
    image: nginx:1.25-alpine
    container_name: apms-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/ssl:/etc/ssl/apms:ro
      - applogs:/var/log/nginx
    networks:
      - apms-frontend-net
      - apms-backend-net
    depends_on:
      - apms-app

  apms-app:
    image: apms/backend:latest
    container_name: apms-api
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    environment:
      - APP_ENV=${APP_ENV}
      - LOG_LEVEL=${LOG_LEVEL}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - CELERY_BROKER_URL=${CELERY_BROKER_URL}
      - CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND}
      - ENCRYPTION_MASTER_KEY=${ENCRYPTION_MASTER_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_ALGORITHM=${JWT_ALGORITHM}
      - S3_ENDPOINT_URL=${S3_ENDPOINT_URL}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
    volumes:
      - applogs:/var/log/apms
    networks:
      - apms-backend-net
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

  apms-worker:
    image: apms/backend:latest
    container_name: apms-worker
    restart: unless-stopped
    command: celery -A app.core.tasks worker --loglevel=info -c 4 -Q punch_pairing,attendance_rollup,payroll_calc,default
    environment:
      - APP_ENV=${APP_ENV}
      - LOG_LEVEL=${LOG_LEVEL}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - CELERY_BROKER_URL=${CELERY_BROKER_URL}
      - CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND}
      - ENCRYPTION_MASTER_KEY=${ENCRYPTION_MASTER_KEY}
      - S3_ENDPOINT_URL=${S3_ENDPOINT_URL}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
    volumes:
      - applogs:/var/log/apms
    networks:
      - apms-backend-net
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    container_name: apms-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - apms-backend-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: >
      postgres -c max_connections=100
               -c shared_buffers=512MB
               -c effective_cache_size=1536MB
               -c maintenance_work_mem=128MB
               -c checkpoint_completion_target=0.9
               -c wal_buffers=16MB
               -c default_statistics_target=100
               -c random_page_cost=1.1

  redis:
    image: redis:7-alpine
    container_name: apms-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy noeviction
    volumes:
      - redisdata:/data
    networks:
      - apms-backend-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  minio:
    image: minio/minio:latest
    container_name: apms-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${S3_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${S3_SECRET_KEY}
    volumes:
      - miniodata:/data
    networks:
      - apms-backend-net
      - apms-frontend-net
    ports:
      - "9000:9000"
      - "9001:9001"
```

---

## 8. Architectural Comparison: Profile XS / S (Docker Compose) vs Profile M / L (Kubernetes)

As the workforce scales from small branches to nationwide enterprise operations, the architecture transitions smoothly from a single-box Docker Compose setup to a multi-container Kubernetes cluster without changing core application code.

| Architectural Dimension | Profile XS / S (Docker Compose) | Profile M / L (Kubernetes Enterprise) | Transition Rationale & Impact |
| :--- | :--- | :--- | :--- |
| **Workforce Scale** | 1 – 50 tenants; < 10,000 employees. | > 50 tenants; 50,000 – 500,000+ employees. | Higher punch burst volumes at shift boundaries (e.g. 09:00 AM shift clock-ins). |
| **Ingress & Edge Routing** | Single Nginx container with local SSL certs. | Kubernetes Ingress Controller (AWS ALB / NGINX Ingress / Traefik) + Cert-Manager. | Automatic TLS certificate renewal, multi-zone traffic distribution, and WAF protection. |
| **API Compute Tier** | Single `apms-app` container running 4 Uvicorn worker threads. | Scaled `apms-api` Deployment (3–20 Pods) with Horizontal Pod Autoscaler (HPA) based on CPU/RAM and request latency. | Dynamic scaling to absorb biometric punch ingestion spikes and payroll crunch days. |
| **Biometric Ingestion** | Routed through main `apms-app` endpoint. | Dedicated `apms-ingest` micro-deployment isolated from business UI REST endpoints. | Prevents bulk device hardware pushes from starving user requests on the HR admin portal. |
| **Background Processing** | Single `apms-worker` Celery container handling all queues. | Multi-pool worker deployments: `worker-pairing`, `worker-rollup`, `worker-payroll`, `worker-reports`. | Prevents heavy end-of-month payroll runs from delaying real-time biometric punch pairing. |
| **Cron Scheduling** | Internal Celery Beat thread or host cron. | Dedicated `apms-beat` singleton Pod and Kubernetes `CronJobs`. | Guarantees exactly-once daily rollup execution and partition maintenance triggers. |
| **Relational Persistence** | Local PostgreSQL 16 container with local persistent volume. | Managed Cloud RDBMS (AWS RDS Aurora Multi-AZ / GCP Cloud SQL) with read replicas. | Automated failover, automated point-in-time snapshots, zero local volume corruption risks. |
| **Task Queue & Caching** | Local single Redis container with AOF persistence. | Redis Sentinel or Managed Cluster (AWS ElastiCache Redis Cluster). | High availability, in-memory failover, and distributed memory capacity. |
| **Object Storage** | Local MinIO container with mounted directory. | Cloud Managed Object Store (AWS S3 / Google Cloud Storage) with lifecycle tiering. | Unlimited durability, multi-region redundancy, and presigned secure URL streaming. |
| **Secrets & Keys** | Plaintext `.env` file secured by OS file permissions. | HashiCorp Vault / AWS Secrets Manager / Kubernetes Secrets with KMS envelope encryption. | Ephemeral secret rotation, RBAC access control, and zero disk exposure. |
| **Deployment Model** | Manual `docker compose up -d` or basic shell script. | GitOps via ArgoCD / Helm Charts with canary and blue-green zero-downtime rollouts. | Safe schema migrations, instant rollbacks, and multi-cluster deployment parity. |

---

## 9. Operational Runbook & Health Monitoring

### 9.1 Container Lifecycle Commands
- **Deploy / Upgrade Stack**:
  ```bash
  docker compose pull
  docker compose up -d --remove-orphans
  ```
- **Execute Alembic Schema Migrations**:
  ```bash
  docker compose exec apms-app alembic upgrade head
  ```
- **Check Cluster Health**:
  ```bash
  docker compose ps
  docker compose exec apms-app curl -s http://localhost:8000/api/v1/health | jq .
  ```

### 9.2 Zero-Downtime Database Backup Routine
```bash
# Automated daily backup of PostgreSQL 16 with custom format
docker compose exec -T postgres pg_dump -U apms_user -d apms_db -F c -b -v -f /var/lib/postgresql/data/backup_$(date +%Y%m%d_%H%M%S).dump
```
