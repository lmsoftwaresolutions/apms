# APMS Technical Architecture & Diagram Documentation Index

> **Status:** Authoritative Master Index | **Version:** 1.0.0 | **Last Updated:** 2026-11-16  
> **Repository:** APMS (Automated Payroll & Attendance Management System)

---

## 1. Executive Architecture Summary

**APMS** is an enterprise-grade, multi-tenant B2B SaaS platform engineered for complex workforce scheduling, biometric attendance pairing, double-entry leave ledgers, and statutory payroll execution (India-first: EPF, ESI, PT, TDS).

### Core Architectural Invariants (Non-Negotiable)
1. **Row-Level Security (RLS)** (`ADR-02`, `SEC-01`): Every tenant-scoped table enforces `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Queries execute with `app.current_tenant_id` context.
2. **Immutable Raw Ingestion** (`ADR-05`, `ATT-01`): `raw_envelope` and `punch_event` are strictly append-only.
3. **Attendance Decoupled from Payroll** (`ADR-07`, `PAY-01`): Finalized attendance ledgers act as read-only inputs to payroll. Payroll never alters raw punches.
4. **Deterministic Calculation & Explanation Trace** (`ADR-14`, `ATT-05`): Daily attendance rollups and monthly pay runs persist an immutable JSON explanation trace.
5. **Double-Entry Leave Accounting** (`ADR-08`, `LVE-01`): Leave balances are derived from append-only `leave_transactions` ledgers, never stored as mutable scalar numbers.
6. **Multi-Session Mid-Gap Exclusion** (`ADR-16`, `N65`): Intervals between scheduled split shifts are strictly non-working time, excluded from worked hours and overtime.
7. **Statutory Parameterization** (`ADR-25`, `STA-01`): EPF ceilings, ESI thresholds, and state PT slabs reside in versioned database tables, never hardcoded in source code.

---

## 2. Master Documentation Directory & Diagram Catalog

All technical architecture documents and diagrams are organized into standardized functional directories under [`docs/`](file:///d:/APMS_Rebuild/docs).

```
docs/
├── architecture/          # High-level architecture, C4 models, module dependencies, contracts
│   ├── c4/                # C4 Context (L1), Container (L2), Component (L3), Structurizr DSL
│   ├── FRONTEND_BACKEND_COMMUNICATION.md
│   ├── module-dependency-map.md
│   └── SERVICE_INTERACTION_CONTRACTS.md
├── database/              # DBML schema, ERDs, partitioning, RLS isolation
│   ├── erd/               # Sub-domain Entity Relationship Diagrams
│   ├── MULTI_TENANT_ISOLATION.md
│   ├── PARTITIONING_AND_INDEXING.md
│   └── schema.dbml
├── api/                   # REST API lifecycle, auth flows, background tasks, webhooks
│   ├── endpoint-maps/     # Exhaustive endpoint tables with Pydantic JSON schemas
│   ├── AUTHENTICATION_FLOW.md
│   ├── BACKGROUND_TASK_GRAPH.md
│   ├── INTEGRATION_CONNECTORS.md
│   ├── REQUEST_LIFECYCLE.md
│   └── WEBHOOK_ARCHITECTURE.md
├── workflows/             # Decision trees, timing sequences, and state machines
│   ├── APPROVAL_WORKFLOW.md
│   ├── CONTINUOUS_DUTY_WORKFLOW.md
│   ├── DAILY_ROLLUP_DECISION_TREE.md
│   ├── DPDP_CONSENT_RETENTION.md
│   ├── FIELD_FORCE_WORKFLOW.md
│   ├── LEAVE_LEDGER_LIFECYCLE.md
│   ├── N65_MULTI_SESSION_TIMING.md
│   ├── N67_SHIFT_MATCHING_OVERRIDE.md
│   ├── OVERTIME_CALCULATION_WORKFLOW.md
│   ├── PAY_RUN_STATE_MACHINE.md
│   ├── PAYROLL_ARREARS_ENGINE.md
│   └── PUNCH_TO_STATUS_STATE_MACHINE.md
├── infrastructure/        # Docker Compose, Edge Agent, CI/CD, environments, observability, DR
│   ├── BACKUP_AND_DISASTER_RECOVERY.md
│   ├── CICD_PIPELINE.md
│   ├── DOCKER_COMPOSE_ARCHITECTURE.md
│   ├── EDGE_SYNC_AGENT.md
│   ├── ENVIRONMENTS.md
│   └── OBSERVABILITY_ARCHITECTURE.md
├── security/              # RBAC matrix, envelope encryption, JWT sessions, STRIDE threat model
│   ├── ENVELOPE_ENCRYPTION.md
│   ├── JWT_SESSION_SECURITY.md
│   ├── RBAC_PERMISSION_MATRIX.md
│   └── THREAT_SURFACE_ANALYSIS.md
└── data-flow/             # End-to-end data pipelines
    ├── DEVICE_INGESTION_STREAM.md
    ├── E2E_PUNCH_TO_PAYSLIP.md
    └── PAYROLL_CALCULATION_PIPELINE.md
```

---

## 3. Complete Architecture Index by Category

### A. System Architecture & C4 Models
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [system-context.md](file:///d:/APMS_Rebuild/docs/architecture/c4/system-context.md) | Mermaid `flowchart TD` | **C4 Level 1: System Context** — APMS boundaries, user personas (HR, Employee, Superadmin), and external integrations (Biometrics, Tally ERP, WhatsApp, Banks, EPFO). |
| [container-architecture.md](file:///d:/APMS_Rebuild/docs/architecture/c4/container-architecture.md) | Mermaid `flowchart TD` | **C4 Level 2: Container Architecture** — Nginx, React SPA, FastAPI Monolith, Redis, Celery, PostgreSQL 16+, MinIO S3, and Edge Sync Agent. |
| [component-architecture.md](file:///d:/APMS_Rebuild/docs/architecture/c4/component-architecture.md) | Mermaid `flowchart TD` | **C4 Level 3: Component Architecture** — FastAPI internal layers: Routers, Tenant & RLS Middleware, Domain Services, Async Repositories, Event Bus. |
| [workspace.dsl](file:///d:/APMS_Rebuild/docs/architecture/c4/workspace.dsl) | Structurizr DSL | **Structurizr C4 Workspace** — Machine-readable architectural models and view definitions for automated pipeline rendering. |
| [module-dependency-map.md](file:///d:/APMS_Rebuild/docs/architecture/module-dependency-map.md) | Mermaid `flowchart LR` | **21-Module Dependency Graph** — Tiered directed graph (P0 Foundation, P1 Business Ops, P2 Extensions) with critical path tagging. |
| [SERVICE_INTERACTION_CONTRACTS.md](file:///d:/APMS_Rebuild/docs/architecture/SERVICE_INTERACTION_CONTRACTS.md) | Mermaid + Matrix | **In-Process Service Contracts** — Modular monolith boundary rules, Python typed interfaces, cross-module transactional consistency. |
| [FRONTEND_BACKEND_COMMUNICATION.md](file:///d:/APMS_Rebuild/docs/architecture/FRONTEND_BACKEND_COMMUNICATION.md) | Mermaid `sequenceDiagram` | **Client-Server Communication** — TanStack Query caching keys, optimistic mutation rollbacks, and WebSocket push events. |

---

### B. Database Architecture & Data Isolation
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [schema.dbml](file:///d:/APMS_Rebuild/docs/database/schema.dbml) | DBML (dbdiagram.io) | **Complete Relational Schema** — All 30 tables, primary/foreign composite keys, enums, nullability, and RLS metadata. |
| [MULTI_TENANT_ISOLATION.md](file:///d:/APMS_Rebuild/docs/database/MULTI_TENANT_ISOLATION.md) | Mermaid `sequenceDiagram` | **Row-Level Security (RLS) Architecture** — JWT claim decoding, `SET LOCAL app.current_tenant_id`, fail-closed kernel evaluation. |
| [ATTENDANCE_SHIFT_ERD.md](file:///d:/APMS_Rebuild/docs/database/erd/ATTENDANCE_SHIFT_ERD.md) | Mermaid `erDiagram` | **Attendance & Shifts Sub-ERD** — Shift templates, dynamic pools, roster patterns, dated instances, raw punches, and daily records. |
| [LEAVE_PAYROLL_ERD.md](file:///d:/APMS_Rebuild/docs/database/erd/LEAVE_PAYROLL_ERD.md) | Mermaid `erDiagram` | **Leave & Payroll Sub-ERD** — Double-entry `leave_transactions`, pay groups, salary structures, immutable pay runs, and employee snapshots. |
| [PARTITIONING_AND_INDEXING.md](file:///d:/APMS_Rebuild/docs/database/PARTITIONING_AND_INDEXING.md) | Architecture Spec + SQL | **Partitioning & Indexing Strategy** — Declarative monthly partitioning on punch tables, B-tree/BRIN indexes, and DPDP 3-year retention cron. |

---

### C. API & Backend Architecture
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [REQUEST_LIFECYCLE.md](file:///d:/APMS_Rebuild/docs/api/REQUEST_LIFECYCLE.md) | Mermaid `flowchart TD` | **FastAPI Request Lifecycle** — Middleware stack execution order (CORS -> Request ID -> Tenant -> JWT -> RLS -> Handler). |
| [AUTHENTICATION_FLOW.md](file:///d:/APMS_Rebuild/docs/api/AUTHENTICATION_FLOW.md) | Mermaid `sequenceDiagram` | **JWT Authentication Architecture** — Login, token issuance, refresh rotation, and logout token invalidation. |
| [ATTENDANCE_API.md](file:///d:/APMS_Rebuild/docs/api/endpoint-maps/ATTENDANCE_API.md) | API Spec Table + JSONs | **Attendance Endpoint Map (M09)** — Punch submission, muster roll retrieval, daily rollups, and regularizations. |
| [PAYROLL_API.md](file:///d:/APMS_Rebuild/docs/api/endpoint-maps/PAYROLL_API.md) | API Spec Table + JSONs | **Payroll Endpoint Map (M15)** — 10-step wizard lifecycle, salary lock, payslip generation, and bank export. |
| [SHIFTS_API.md](file:///d:/APMS_Rebuild/docs/api/endpoint-maps/SHIFTS_API.md) | API Spec Table + JSONs | **Shifts & Rostering Map (M05, M06)** — Shift templates, rotation pattern assignments, and dated overrides. |
| [LEAVE_API.md](file:///d:/APMS_Rebuild/docs/api/endpoint-maps/LEAVE_API.md) | API Spec Table + JSONs | **Leave Management Map (M11)** — Leave application, double-entry ledger balance query, sandwich evaluation. |
| [DEVICE_CONNECTOR_API.md](file:///d:/APMS_Rebuild/docs/api/endpoint-maps/DEVICE_CONNECTOR_API.md) | API Spec Table + JSONs | **Device & Ingestion Map (M07, M08)** — ADMS push endpoints, Edge Agent heartbeats, command queues, and sync status. |
| [BACKGROUND_TASK_GRAPH.md](file:///d:/APMS_Rebuild/docs/api/BACKGROUND_TASK_GRAPH.md) | Mermaid Flowchart + Table | **Celery Task Dependency Graph** — Queue priorities (`high`, `default`, `batch`), Celery Beat schedules, Redlock, and DLQ handling. |
| [INTEGRATION_CONNECTORS.md](file:///d:/APMS_Rebuild/docs/api/INTEGRATION_CONNECTORS.md) | Mermaid Flowcharts | **External Connectors Architecture** — Tally Prime XML, Zoho Books, Banking NEFT/RTGS CSV batches, and WhatsApp BSP. |
| [WEBHOOK_ARCHITECTURE.md](file:///d:/APMS_Rebuild/docs/api/WEBHOOK_ARCHITECTURE.md) | Mermaid Flowchart + Sequence | **Outbound Webhook Delivery Engine** — HMAC-SHA256 signature verification, exponential retry backoff, and tenant subscription portal. |

---

### D. Business Logic, Decision Engines & Workflows
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [DAILY_ROLLUP_DECISION_TREE.md](file:///d:/APMS_Rebuild/docs/workflows/DAILY_ROLLUP_DECISION_TREE.md) | Mermaid `flowchart TD` | **Daily Rollup Calculation Engine** — 7-step decision tree evaluating calendar flags, leave ledgers, punches, and grace bands. |
| [PUNCH_TO_STATUS_STATE_MACHINE.md](file:///d:/APMS_Rebuild/docs/workflows/PUNCH_TO_STATUS_STATE_MACHINE.md) | Mermaid `stateDiagram-v2` | **Attendance Daily Record Lifecycle** — States: `NO_PUNCH` -> `PUNCHED` -> `CALCULATING` -> `PRESENT` / `HALF_DAY` / `ABSENT`. |
| [N65_MULTI_SESSION_TIMING.md](file:///d:/APMS_Rebuild/docs/workflows/N65_MULTI_SESSION_TIMING.md) | Mermaid `sequenceDiagram` | **N65 Multi-Session Gap Timing** — Boundary punch enforcement and strict mathematical exclusion of mid-gap non-working hours. |
| [N67_SHIFT_MATCHING_OVERRIDE.md](file:///d:/APMS_Rebuild/docs/workflows/N67_SHIFT_MATCHING_OVERRIDE.md) | Mermaid `flowchart TD` | **N67 Dual-Path Shift Matching** — Path A (Scheduled roster) vs Path B (Dynamic pool detection) vs Path C (Manager override). |
| [APPROVAL_WORKFLOW.md](file:///d:/APMS_Rebuild/docs/workflows/APPROVAL_WORKFLOW.md) | Mermaid `stateDiagram-v2` + Seq | **Generic Approval Workflow Engine** — Multi-level approval chains (L1/L2), auto-approvals (Q6 WFH), and SLA auto-escalation. |
| [LEAVE_LEDGER_LIFECYCLE.md](file:///d:/APMS_Rebuild/docs/workflows/LEAVE_LEDGER_LIFECYCLE.md) | Mermaid `flowchart TD` | **Double-Entry Leave Ledger** — Debit/credit transaction pairs, sandwich rule bridging, and lapse/encashment rules. |
| [PAY_RUN_STATE_MACHINE.md](file:///d:/APMS_Rebuild/docs/workflows/PAY_RUN_STATE_MACHINE.md) | Mermaid `stateDiagram-v2` | **Monthly Pay Run Execution Lifecycle** — States: `DRAFT` -> `LOCKED` -> `CALCULATED` -> `DISBURSED` -> `COMPLETED`. |
| [PAYROLL_ARREARS_ENGINE.md](file:///d:/APMS_Rebuild/docs/workflows/PAYROLL_ARREARS_ENGINE.md) | Mermaid `flowchart TD` | **Retrospective Salary Arrears Engine** — Recalculating historic months, generating differential line items, and active settlement. |
| [OVERTIME_CALCULATION_WORKFLOW.md](file:///d:/APMS_Rebuild/docs/workflows/OVERTIME_CALCULATION_WORKFLOW.md) | Mermaid `flowchart TD` | **Overtime Engine & Comp-Off Workflow** — Daily & weekly caps (Factories Act 48h), 1.5x/2.0x rates, and expiring comp-off credits. |
| [CONTINUOUS_DUTY_WORKFLOW.md](file:///d:/APMS_Rebuild/docs/workflows/CONTINUOUS_DUTY_WORKFLOW.md) | Mermaid State & Sequence | **24h/36h/48h Continuous Duty (Q5)** — Healthcare & plant continuous shifts, shift handovers, and mandatory post-duty rest generation. |
| [FIELD_FORCE_WORKFLOW.md](file:///d:/APMS_Rebuild/docs/workflows/FIELD_FORCE_WORKFLOW.md) | Mermaid `flowchart TD` | **Mobile GPS Clock-In & Geofencing** — Ray-casting point-in-polygon verification, mock location spoof detection, and offline sync. |
| [DPDP_CONSENT_RETENTION.md](file:///d:/APMS_Rebuild/docs/workflows/DPDP_CONSENT_RETENTION.md) | Mermaid `stateDiagram-v2` | **DPDP Act 2023 Compliance Lifecycle** — Biometric explicit consent logging, right-to-erasure vs statutory payroll freeze. |

---

### E. Infrastructure & DevOps Architecture
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [DOCKER_COMPOSE_ARCHITECTURE.md](file:///d:/APMS_Rebuild/docs/infrastructure/DOCKER_COMPOSE_ARCHITECTURE.md) | Mermaid Flowchart + Spec | **Docker Compose Architecture (XS/S)** — Single-box topology, internal bridge networks, volume mounts, and service definitions. |
| [EDGE_SYNC_AGENT.md](file:///d:/APMS_Rebuild/docs/infrastructure/EDGE_SYNC_AGENT.md) | Mermaid Flowchart + Sequence | **Edge Sync Agent Deployment** — Local factory LAN daemon, SQLite 7-day buffer, ADMS push collector, and HTTPS relay. |
| [CICD_PIPELINE.md](file:///d:/APMS_Rebuild/docs/infrastructure/CICD_PIPELINE.md) | Mermaid `flowchart TD` | **Automated CI/CD Test Pipeline** — GitHub Actions workflow: Linters -> RLS leak test gate -> Exact-paisa golden vector tests -> Trivy -> Rolling deploy. |
| [ENVIRONMENTS.md](file:///d:/APMS_Rebuild/docs/infrastructure/ENVIRONMENTS.md) | Architecture Spec + Table | **Multi-Environment Topology** — Dev, Staging, and Production specifications (CPU, RAM, PgBouncer pool sizing, Redis eviction). |
| [BACKUP_AND_DISASTER_RECOVERY.md](file:///d:/APMS_Rebuild/docs/infrastructure/BACKUP_AND_DISASTER_RECOVERY.md) | Mermaid SequenceDiagram | **Disaster Recovery & Backup Strategy** — PostgreSQL WAL-G continuous archiving, MinIO replication, and PITR restore under 1 hour (RPO < 15m). |
| [OBSERVABILITY_ARCHITECTURE.md](file:///d:/APMS_Rebuild/docs/infrastructure/OBSERVABILITY_ARCHITECTURE.md) | Mermaid Flowchart | **Observability Pipeline** — OpenTelemetry collector, Prometheus metrics, Loki log aggregation, Tempo traces, and Grafana alert rules. |

---

### F. Security Architecture & Cryptography
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [RBAC_PERMISSION_MATRIX.md](file:///d:/APMS_Rebuild/docs/security/RBAC_PERMISSION_MATRIX.md) | Mermaid Hierarchy + Table | **5-Tier RBAC Permission Matrix** — Role hierarchy (Superadmin -> Tenant Admin -> HR -> Payroll -> Employee) and granular permissions. |
| [ENVELOPE_ENCRYPTION.md](file:///d:/APMS_Rebuild/docs/security/ENVELOPE_ENCRYPTION.md) | Mermaid Flowchart + Spec | **Field-Level Envelope Encryption** — AES-256-GCM encryption with KMS/Vault master key, tenant DEKs, and HMAC blind indexes for PII. |
| [JWT_SESSION_SECURITY.md](file:///d:/APMS_Rebuild/docs/security/JWT_SESSION_SECURITY.md) | Mermaid `sequenceDiagram` | **Session & Token Security** — Asymmetric RS256 JWTs, 15-minute access tokens, HTTP-only refresh cookies, and Redis revocation lists. |
| [THREAT_SURFACE_ANALYSIS.md](file:///d:/APMS_Rebuild/docs/security/THREAT_SURFACE_ANALYSIS.md) | STRIDE Threat Matrix | **STRIDE Threat Model** — Detailed mitigations across multi-tenant boundaries, biometric hardware tampering, spoofing, and API flooding. |

---

### G. End-to-End Data Flows
| Document | Diagram Type | Scope / Description |
|---|---|---|
| [E2E_PUNCH_TO_PAYSLIP.md](file:///d:/APMS_Rebuild/docs/data-flow/E2E_PUNCH_TO_PAYSLIP.md) | Mermaid `flowchart TD` | **Master Data Pipeline** — The full journey: Biometric Terminal -> Edge Agent -> Ingestion -> Pairing -> Rollup -> Leave -> Payroll -> Payslip. |
| [DEVICE_INGESTION_STREAM.md](file:///d:/APMS_Rebuild/docs/data-flow/DEVICE_INGESTION_STREAM.md) | Mermaid `flowchart TD` | **Biometric Push Ingestion Stream** — High-throughput push parsing, SHA-256 checksums, append-only `raw_envelope`, and debounce normalization. |
| [PAYROLL_CALCULATION_PIPELINE.md](file:///d:/APMS_Rebuild/docs/data-flow/PAYROLL_CALCULATION_PIPELINE.md) | Mermaid `flowchart TD` | **10-Step Statutory Payroll Engine** — Mathematical flowchart computing Gross -> EPF (₹15,000 ceiling) -> ESI (₹21,000 threshold) -> PT -> TDS -> Net Pay. |

---

## 4. Verification & Standards Compliance

Every document and diagram in this catalog satisfies the APMS Engineering Standards:
1. **Authoritative Citation**: Every document includes explicit requirement tags (`PLT-*`, `IAM-*`, `ATT-*`, `PAY-*`, `LVE-*`, `SHF-*`, `SEC-*`, `N65`, `N67`, `Q5`, `Q6`).
2. **Text-Based Version Control**: All diagrams are authored in pure Markdown with standard Mermaid.js blocks or declarative DBML/Structurizr DSL — ensuring versioning in Git with zero binary bloat.
3. **Multi-Tenant Invariants**: Every schema, data flow, and API endpoint incorporates mandatory `tenant_id` scoping and RLS policy verification.
4. **Reproducibility**: Source models can be rendered in real-time in any standard Markdown viewer, GitHub preview, or CI/CD documentation builder.
