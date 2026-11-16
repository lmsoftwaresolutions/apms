# APMS — C4 Level 1: System Context Diagram

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Source:** Derived from SYSTEM_ARCHITECTURE.md, PRD.md, MODULES_AND_FEATURES.md

---

## 1. Purpose

APMS (Automated Payroll & Attendance Management System) is an enterprise-grade, multi-tenant B2B SaaS platform that unifies workforce scheduling, multi-source biometric attendance pairing, double-entry leave ledgers, and 100% compliant statutory payroll execution (India-first: EPF, ESI, PT, TDS).

The system eliminates error-prone manual spreadsheets, solves complex scheduling anomalies (overnight shifts, 24h/36h/48h duties, split sessions, rotating rosters), enforces an uncompromised audit trail, and guarantees statutory compliance down to the exact paisa (±₹0.00).

---

## 2. System Context Diagram (C4 Level 1)

```mermaid
flowchart TD
    %% ─── Human Actors ───────────────────────────────────────────────
    HR["👤 HR Admin / Payroll Officer\n(HRO)\nConfigures pay groups, runs 10-step\npayroll wizard, manages attendance\nregularizations & muster rolls"]
    EMP["👤 Employee / ESS User\n(EMP)\nClocks in/out, checks leave balances,\ndownloads payslips, submits\nregularization requests"]
    ADMIN["👤 Tenant Administrator\n(ADM)\nManages org master data, branches,\ndepartments, feature flags,\nsubscription settings"]
    SUPER["👤 Platform Superadmin\n(PLATFORM_ADMIN)\nCross-tenant diagnostics, subscription\nmanagement, platform health monitoring"]
    DEV_ADM["👤 Device Admin\n(DEV_ADM)\nRegisters biometric hardware, monitors\nEdge Sync Agents, diagnoses device\ncommunication failures & clock drift"]

    %% ─── Core System ─────────────────────────────────────────────────
    APMS["🏢 APMS\nAutomated Payroll & Attendance\nManagement System\n\nModular Monolith · Multi-Tenant SaaS\nPython 3.12+ / FastAPI · PostgreSQL 16+\nReact 18+ / TypeScript\nRedis / Celery · Docker or Kubernetes"]

    %% ─── External Systems ────────────────────────────────────────────
    BIOMETRIC["🖥️ ZKTeco / Biometric Devices\n(Hardware)\nFingerprint & face terminals pushing\npunches via ADMS / HTTP push protocol\nor polled by Edge Sync Agent"]
    EDGE["⚙️ Edge Sync Agent\n(Local Daemon)\nLightweight Python/Rust daemon on\nfactory LAN — buffers punches offline\nup to 7 days, relays on reconnect"]
    TALLY["📊 Tally ERP / Zoho / SAP\n(Accounting ERP)\nReceives payroll journal vouchers\nas Tally Prime XML, Zoho Books,\nor SAP RFC exports"]
    WHATSAPP["💬 WhatsApp BSP\n(Official Business API)\nDelivers approval notifications,\nleave status alerts & payslip\nrelease messages to employees"]
    EMAIL["📧 Email SMTP\n(Transactional Email)\nSends payslips, approval emails,\nworkflow notifications & statutory\nreminder alerts"]
    SMS["📱 SMS Gateway\n(Transactional SMS)\nFallback channel for OTP delivery,\npunch alerts & urgent\npayroll notifications"]
    BANK["🏦 Bank / NEFT / NACH\n(Salary Disbursement)\nReceives NEFT/RTGS/NACH batch\nfiles for HDFC, ICICI, SBI,\nAxis Bank salary disbursements"]
    GOVT["🏛️ Government Portals\n(EPF / ESI / PT)\nReceives statutory contribution\nfiles: EPF ECR text, ESI returns,\nPT challans, Form 24Q / Form 16"]

    %% ─── Actor → System flows ─────────────────────────────────────────
    HR -->|"HTTPS / REST\n(Web Browser)"| APMS
    EMP -->|"HTTPS / REST\n(ESS Web / Mobile App)"| APMS
    ADMIN -->|"HTTPS / REST\n(Admin Console)"| APMS
    SUPER -->|"HTTPS / REST\n(Platform Console)"| APMS
    DEV_ADM -->|"HTTPS / REST\n(Device Dashboard)"| APMS

    %% ─── External System flows ────────────────────────────────────────
    BIOMETRIC -->|"ADMS / HTTP Push\nRaw biometric punches"| APMS
    EDGE -->|"Buffered HTTPS POST\nRelayed punch batches"| APMS
    APMS -->|"Tally XML / CSV\nJournal export"| TALLY
    APMS -->|"WhatsApp Business API\nApproval & alert messages"| WHATSAPP
    APMS -->|"SMTP TLS\nPayslips, notifications"| EMAIL
    APMS -->|"SMS API\nOTP & alerts"| SMS
    APMS -->|"NEFT/RTGS/NACH CSV\nBank batch files"| BANK
    APMS -->|"EPF ECR, ESI Returns\nPT Challans, Form 24Q"| GOVT
```

---

## 3. Actors

| Actor | Role Code | Primary Responsibilities |
|:---|:---|:---|
| **HR Admin / Payroll Officer** | `HRO` | Configures pay groups, executes 10-step payroll wizard, manages muster rolls, handles attendance regularizations, generates statutory returns |
| **Employee** | `EMP` | Clocks in/out (mobile/biometric), checks attendance calendar, applies for leave, downloads payslips, requests punch regularizations |
| **Tenant Administrator** | `ADM` | Manages org structure (branches, departments), user roles, feature flags, subscription settings, security policies |
| **Platform Superadmin** | `PLATFORM_ADMIN` | Cross-tenant diagnostics, subscription management, platform health, audited impersonation |
| **Device Admin** | `DEV_ADM` | Registers biometric hardware, configures Edge Sync Agents, monitors device heartbeat and clock drift |

---

## 4. External Systems

| System | Category | Integration Direction | Protocol |
|:---|:---|:---|:---|
| **ZKTeco / Biometric Devices** | Hardware | Inbound → APMS | ADMS push / HTTP POST |
| **Edge Sync Agent** | Local Daemon | Inbound → APMS | Buffered HTTPS POST |
| **Tally ERP / Zoho / SAP** | Accounting ERP | APMS → Outbound | Tally Prime XML, CSV |
| **WhatsApp BSP** | Messaging | APMS → Outbound | WhatsApp Business API |
| **Email SMTP** | Messaging | APMS → Outbound | SMTP/TLS |
| **SMS Gateway** | Messaging | APMS → Outbound | SMS REST API |
| **Bank (NEFT/RTGS/NACH)** | Financial | APMS → Outbound | Batch CSV file upload |
| **Government Portals (EPF/ESI/PT)** | Statutory | APMS → Outbound | EPF ECR, ESI XML, PT Challan |

---

## 5. Key Non-Functional Characteristics

| NFR | Requirement |
|:---|:---|
| **Multi-Tenancy** | Zero cross-tenant leakage via PostgreSQL 16+ Row-Level Security on `tenant_id` |
| **Ingestion Throughput** | 10,000 raw punches/minute, <200ms response latency |
| **Availability** | 99.9% uptime; Edge Agent offline buffer up to 7 days |
| **Audit Trail** | Immutable JSON explanation trace on every attendance rollup and payroll run |
| **Statutory Compliance** | EPF, ESI, PT, TDS; DPDP Act 2023; 8-year retention |
| **Cost Ceiling** | ≤ ₹80 per active employee per month total infrastructure cost |
