# APMS — Automated Payroll & Attendance Management System

> **Enterprise-Grade Multi-Tenant B2B SaaS Platform**  
> Engineered for complex workforce scheduling, multi-device biometric attendance pairing, double-entry leave ledgers, and 100% compliant Indian statutory payroll (EPF, ESI, PT, TDS).

[![Architecture Index](https://img.shields.io/badge/Architecture-Master%20Index-blue.svg)](docs/ARCHITECTURE_INDEX.md)
[![Visual Gallery](https://img.shields.io/badge/Visual%20Gallery-34%20Diagrams-success.svg)](docs/ARCHITECTURE_GALLERY.html)
[![Database DBML](https://img.shields.io/badge/Database-31%20Tables%20DBML-purple.svg)](docs/database/schema.dbml)
[![HRMS Roadmap](https://img.shields.io/badge/Product-HRMS%20Extension-orange.svg)](docs/product/HRMS_EXTENSION_ROADMAP.md)

---

## 1. Executive Product Strategy: Base APMS to Full HRMS

APMS is developed under a disciplined **Two-Horizon Evolutionary Architecture**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      STAGE 1: BASE PLATFORM (APMS)                     │
│               Workforce Scheduling · Biometrics · Payroll              │
├────────────────────────────────────────────────────────────────────────┤
│ • Industrial-strength Shift Rostering (M05, M06)                       │
│ • Hardware Ingestion & Biometric Pairing Engine (M07, M08)             │
│ • Deterministic Daily Attendance Ledger & N65 Gap Exclusion (M09)      │
│ • Double-Entry Leave Ledger & Sandwich Rule Engine (M11)               │
│ • 10-Step Indian Statutory Payroll: EPF, ESI, PT, TDS (M15, M16)       │
│ • Row-Level Security, AES-256 PII Encryption & WORM Audit Logs         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Extends seamlessly via
                                    │ In-Process Modular Monolith
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGE 2: STRATEGIC EXTENSION (FULL HRMS)             │
│                 Hire-to-Retire Enterprise Employee Lifecycle           │
├────────────────────────────────────────────────────────────────────────┤
│ • H01: Applicant Tracking System (ATS) & Pre-Hire Onboarding           │
│ • H02: Performance Management System (PMS), OKRs & 360° Appraisals     │
│ • H03: Learning Management System (LMS) & Statutory Training (POSH)    │
│ • H04: Corporate Travel Desk & OCR Expense Reimbursements              │
│ • H05: IT & Physical Hardware Asset Lifecycle & F&F Recovery           │
│ • H06: Employee Engagement, Mood Bot & eNPS Pulse Surveys              │
│ • H07: HR Helpdesk Ticketing & POSH Act 2013 Grievance Redressal       │
│ • H08: Visitor & Gate Pass Management                                  │
│ • H09: Alumni Portal & Multi-Department "No-Due" Exit Clearance        │
│ • H10: Psychometric Candidate Testing & Cognitive Assessment           │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Horizon 0: Base APMS (Active Scope — Modules M01–M21)**  
   Solves enterprise scheduling anomalies (overnight shifts, 24h/36h/48h healthcare duties, split sessions), handles millions of raw biometric punch events with zero data loss, enforces mathematically verifiable attendance rollups, and calculates statutory payroll down to the exact paisa (±₹0.00).
2. **Horizons 1–3: Full Enterprise HRMS (Post-APMS GA Extension — Modules H01–H10)**  
   Seamlessly expands APMS into a full Hire-to-Retire HRMS suite without altering core attendance or payroll invariants. Fully documented in [`docs/product/HRMS_EXTENSION_ROADMAP.md`](file:///d:/APMS_Rebuild/docs/product/HRMS_EXTENSION_ROADMAP.md).

---

## 2. Core Architectural Invariants (Non-Negotiable)

1. **Row-Level Security (RLS)**: Every tenant-scoped table enforces `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Every query executes within `app.current_tenant_id` context (`docs/database/MULTI_TENANT_ISOLATION.md`).
2. **Immutable Raw Ingestion**: `raw_envelope` and `punch_event` are strictly append-only. Raw biometric punches are never updated or deleted (`docs/data-flow/DEVICE_INGESTION_STREAM.md`).
3. **Attendance Decoupled from Payroll**: Daily attendance ledgers act as read-only inputs to payroll. Payroll never alters raw punches, and attendance never computes wages (`docs/data-flow/E2E_PUNCH_TO_PAYSLIP.md`).
4. **Deterministic Calculation & Explanation Traces**: Every daily rollup and pay run persists an immutable JSON explanation trace detailing rule inputs, policy bands, and intermediate calculations.
5. **Double-Entry Leave Accounting**: Leave balances are never stored as mutable scalar numbers; they are derived from append-only debit/credit transaction ledgers (`docs/workflows/LEAVE_LEDGER_LIFECYCLE.md`).
6. **Multi-Session Gap Exclusion (N65)**: Intervals between scheduled sessions (e.g., split shifts) are strictly non-working time, excluded from worked hours and OT (`docs/workflows/N65_MULTI_SESSION_TIMING.md`).
7. **Statutory Parameterization**: EPF wage ceilings (₹15,000), ESI thresholds (₹21,000), and state PT slabs reside in versioned database tables, never hardcoded in source code (`docs/data-flow/PAYROLL_CALCULATION_PIPELINE.md`).
8. **Field-Level Envelope Encryption**: PII (Aadhaar, PAN, Bank Accounts, Salaries) is protected using AES-256-GCM envelope encryption with KMS master keys and HMAC blind indexes (`docs/security/ENVELOPE_ENCRYPTION.md`).

---

## 3. Technology Stack

| Layer | Technology | Version / Standards |
| :--- | :--- | :--- |
| **Backend API** | Python / FastAPI (Async) | Python 3.12+, Pydantic v2, ASGI |
| **Relational Database** | PostgreSQL + RLS | PostgreSQL 16+, Declarative Partitioning, B-tree/BRIN |
| **ORM & Migrations** | SQLAlchemy (Async) & Alembic | SQLAlchemy 2.0 (asyncpg), Zero-downtime migrations |
| **Task Queue & Cache** | Redis 7+ & Celery / ARQ | Redis Streams (buffer), Celery Beat, Distributed Redlock |
| **Frontend Web** | React 18+ & TypeScript | Strict mode, Vite, Tailwind CSS, TanStack Query, Radix UI |
| **Object Storage** | MinIO / AWS S3 | Encrypted encrypted documents (payslips, reports, biometric raw) |
| **Hardware Integration** | Edge Sync Agent | Local Python/Rust daemon, SQLite buffer, ADMS push, mTLS |
| **Container & CI/CD** | Docker & GitHub Actions | Docker Compose (Profile XS/S), Trivy scan, Golden vector CI |

---

## 4. Documentation & Architecture Map

The project features comprehensive architectural documentation, including 34 visual diagrams and ERDs:

### Core Documentation Links
- **[Interactive Visual Architecture Gallery](file:///d:/APMS_Rebuild/docs/ARCHITECTURE_GALLERY.html)** — Self-contained interactive gallery to view and zoom all 34 architecture and database diagrams.
- **[Master Architecture Documentation Index](file:///d:/APMS_Rebuild/docs/ARCHITECTURE_INDEX.md)** — Comprehensive index of all 48 architecture specs and diagrams.
- **[Database Schema DBML](file:///d:/APMS_Rebuild/docs/database/schema.dbml)** — Complete 31-table relational schema with composite foreign keys, RLS scoping, and indexing.
- **[Product Requirements Document (PRD)](file:///d:/APMS_Rebuild/docs/product/PRD.md)** — Authoritative functional and compliance requirements.
- **[Modules & Features Catalog](file:///d:/APMS_Rebuild/docs/MODULES_AND_FEATURES.md)** — Granular breakdown of base APMS (M01–M21) and future HRMS extensions (H01–H10).
- **[Future HRMS Extension Roadmap](file:///d:/APMS_Rebuild/docs/product/HRMS_EXTENSION_ROADMAP.md)** — Architectural specifications for post-APMS enterprise HRMS modules.

### Documentation Directory Structure
```
docs/
├── architecture/          # High-level architecture, C4 models, module dependencies, contracts
│   ├── c4/                # C4 Context (L1), Container (L2), Component (L3), Structurizr DSL
│   ├── DATABASE_DESIGN.md
│   ├── FRONTEND_BACKEND_COMMUNICATION.md
│   ├── module-dependency-map.md
│   └── SERVICE_INTERACTION_CONTRACTS.md
├── database/              # DBML schema, ERDs, partitioning, RLS isolation
│   ├── erd/               # Master ERD, Attendance/Shift Sub-ERD, Leave/Payroll Sub-ERD
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
├── data-flow/             # End-to-end data pipelines
│   ├── DEVICE_INGESTION_STREAM.md
│   ├── E2E_PUNCH_TO_PAYSLIP.md
│   └── PAYROLL_CALCULATION_PIPELINE.md
└── product/               # PRD, Vision, MVP Scope, and HRMS Extension Roadmap
    ├── HRMS_EXTENSION_ROADMAP.md
    ├── MVP_SCOPE.md
    ├── PRD.md
    └── VISION.md
```

---

## 5. Development Guidelines & Status

> [!IMPORTANT]
> The APMS project is currently in the **Architecture, Documentation & Planning Phase**.
> Application codebase implementation, database migrations, and backend services will begin following architectural sign-off.

For detailed developer conventions and architectural rules, refer to:
- [`AGENTS.md`](file:///d:/APMS_Rebuild/AGENTS.md) — Agent development instructions and invariants.
- [`.agents/rules/apms-core.md`](file:///d:/APMS_Rebuild/.agents/rules/apms-core.md) — APMS core business invariants.
- [`.agents/rules/architecture.md`](file:///d:/APMS_Rebuild/.agents/rules/architecture.md) — Modular monolith and persistence constraints.
- [`.agents/rules/security.md`](file:///d:/APMS_Rebuild/.agents/rules/security.md) — Multi-tenant RLS, encryption, and DPDP compliance.
