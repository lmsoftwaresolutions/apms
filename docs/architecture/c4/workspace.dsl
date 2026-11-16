workspace "APMS" "Automated Payroll & Attendance Management System — Architecture Workspace" {

    model {
        // ─── Human Actors ─────────────────────────────────────────────
        hrAdmin = person "HR Admin / Payroll Officer" "Configures pay groups, executes 10-step payroll wizard, manages attendance regularizations & muster rolls." "Human Actor"
        employee = person "Employee / ESS User" "Clocks in/out, checks attendance calendar, applies for leave, downloads payslips." "Human Actor"
        tenantAdmin = person "Tenant Administrator" "Manages organizational master data, branches, departments, security policies, and feature flags." "Human Actor"
        platformAdmin = person "Platform Superadmin" "Performs cross-tenant diagnostics, subscription management, and platform health monitoring." "Human Actor"
        deviceAdmin = person "Device Administrator" "Registers biometric hardware, monitors Edge Sync Agents, diagnoses device communication and clock drift." "Human Actor"

        // ─── Primary System (APMS) ────────────────────────────────────
        apms = softwareSystem "APMS Platform" "Multi-tenant B2B SaaS platform for workforce scheduling, biometric attendance pairing, double-entry leave ledgers, and statutory payroll." {
            nginx = container "Nginx Reverse Proxy" "TLS termination, static asset serving, rate limiting, and HTTP reverse proxy routing." "Nginx 1.25+" "Reverse Proxy"
            spa = container "React Single Page Application" "Responsive web console for HR, employees, tenant administrators, and device administrators." "React 18, TypeScript, Vite, Tailwind CSS, TanStack Query" "Web Browser"
            api = container "FastAPI Modular Monolith Backend" "REST API gateway, JWT auth, tenant RLS context injection, and 21 domain modules (M01–M21)." "Python 3.12, FastAPI, SQLAlchemy 2.0 Async, Pydantic v2" "Application Service"
            worker = container "Celery Worker" "Asynchronous background worker executing punch pairing, daily attendance rollups, and payroll calculations." "Python 3.12, Celery" "Background Worker"
            beat = container "Celery Beat Scheduler" "Cron scheduler dispatching recurring daily rollups, monthly payroll reminders, and telemetry checks." "Celery Beat" "Scheduler"
            redis = container "Redis Cache & Task Queue" "Broker and result backend for Celery, caching feature flags and session data." "Redis 7+" "Cache / Message Broker"
            postgres = container "PostgreSQL Database" "Primary relational persistence with Row-Level Security on tenant_id, declarative partitioning, and audit traces." "PostgreSQL 16+" "Database"
            minio = container "Object Storage (MinIO / S3)" "Encrypted storage for PDF payslips, employee contract documents, and statutory export files." "MinIO / AWS S3" "Object Storage"
        }

        // ─── External Systems ─────────────────────────────────────────
        biometricDevice = softwareSystem "Biometric Hardware Terminals" "ZKTeco, eSSL, and Time Office terminals pushing raw biometric punches via ADMS or HTTP push." "External Hardware"
        edgeSyncAgent = softwareSystem "Edge Sync Agent" "Lightweight Python/Rust daemon running on local factory LAN, buffering punches offline and relaying over HTTPS." "External Edge"
        tallyErp = softwareSystem "Tally ERP / Accounting System" "Receives payroll journal voucher exports as Tally Prime XML, Zoho Books, or SAP RFC." "External System"
        whatsappGateway = softwareSystem "WhatsApp BSP Gateway" "Official WhatsApp Business API partner for workflow notifications and payslip alerts." "External System"
        emailService = softwareSystem "Email SMTP Service" "Transactional email delivery service for password resets, payslips, and workflow alerts." "External System"
        smsGateway = softwareSystem "SMS Gateway" "Transactional SMS provider for OTP authentication and critical operational alerts." "External System"
        bankDisbursement = softwareSystem "Bank Disbursement Gateway" "Processes NEFT, RTGS, and NACH salary disbursement batch files (HDFC, ICICI, SBI, Axis)." "External System"
        govtPortals = softwareSystem "Government Statutory Portals" "Receives statutory contribution returns: EPF ECR text, ESI returns, PT challans, Form 24Q." "External System"

        // ─── Level 1 Relationships (Context) ─────────────────────────
        hrAdmin -> apms "Manages payroll, attendance regularizations, and employee records" "HTTPS / Browser"
        employee -> apms "Clocks in/out, views calendar, applies for leave, downloads payslips" "HTTPS / ESS"
        tenantAdmin -> apms "Configures organization hierarchy, policies, and feature flags" "HTTPS / Browser"
        platformAdmin -> apms "Monitors platform health, manages subscriptions, performs audits" "HTTPS / Browser"
        deviceAdmin -> apms "Manages biometric hardware devices and edge sync agents" "HTTPS / Browser"

        biometricDevice -> apms "Pushes raw punch events to" "ADMS / HTTP Push"
        edgeSyncAgent -> apms "Relays buffered punch logs to" "HTTPS POST"

        apms -> tallyErp "Exports payroll journal vouchers to" "Tally XML / CSV"
        apms -> whatsappGateway "Dispatches approval and alert notifications via" "HTTPS REST"
        apms -> emailService "Sends payslips and system alerts via" "SMTP / TLS"
        apms -> smsGateway "Sends OTP and urgent alerts via" "HTTPS REST"
        apms -> bankDisbursement "Transmits salary disbursement batch files to" "NEFT / RTGS / NACH CSV"
        apms -> govtPortals "Uploads statutory contribution files to" "ECR / File Upload"

        // ─── Level 2 Relationships (Containers) ──────────────────────
        hrAdmin -> nginx "Accesses HR & Payroll portal via" "HTTPS :443"
        employee -> nginx "Accesses ESS portal via" "HTTPS :443"
        tenantAdmin -> nginx "Accesses Tenant Admin console via" "HTTPS :443"
        platformAdmin -> nginx "Accesses Platform Superadmin console via" "HTTPS :443"
        deviceAdmin -> nginx "Accesses Hardware Management console via" "HTTPS :443"

        biometricDevice -> nginx "Pushes punch events to" "HTTP POST /api/v1/devices/push"
        edgeSyncAgent -> nginx "Relays buffered punches to" "HTTPS POST /api/v1/ingest/batch"

        nginx -> spa "Serves static web assets to" "HTTP"
        nginx -> api "Reverse proxies REST API calls to" "HTTP :8000"
        spa -> api "Invokes business endpoints on" "JSON / REST :8000"

        api -> redis "Caches session and feature flags, enqueues tasks to" "Redis Protocol :6379"
        api -> postgres "Queries and persists data with RLS context via" "SQLAlchemy Async :5432"
        api -> minio "Uploads and retrieves document files via" "S3 API :9000"

        worker -> redis "Pulls background tasks from" "Redis Protocol :6379"
        worker -> postgres "Reads raw punches and persists rollups with RLS via" "SQLAlchemy Async :5432"
        worker -> minio "Stores generated payslip PDFs and exports to" "S3 API :9000"
        beat -> redis "Dispatches cron-scheduled tasks to" "Redis Protocol :6379"

        api -> emailService "Sends transactional emails via" "SMTP / TLS"
        worker -> whatsappGateway "Dispatches WhatsApp messages via" "HTTPS REST"
        worker -> smsGateway "Dispatches SMS messages via" "HTTPS REST"
        worker -> tallyErp "Generates journal vouchers for" "Tally XML"
        worker -> bankDisbursement "Generates disbursement batch files for" "CSV Batch"
        worker -> govtPortals "Generates statutory filing files for" "ECR / CSV"
    }

    views {
        systemContext apms "SystemContext" "Level 1 System Context Diagram for APMS" {
            include *
            autoLayout lr
        }

        container apms "Containers" "Level 2 Container Diagram for APMS Platform" {
            include *
            autoLayout tb
        }

        styles {
            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "External System" {
                background #757575
                color #ffffff
            }
            element "External Hardware" {
                shape Robot
                background #e65100
                color #ffffff
            }
            element "External Edge" {
                shape Component
                background #ef6c00
                color #ffffff
            }
            element "Container" {
                background #1976d2
                color #ffffff
            }
            element "Reverse Proxy" {
                shape Pipe
                background #2e7d32
                color #ffffff
            }
            element "Web Browser" {
                shape WebBrowser
                background #388e3c
                color #ffffff
            }
            element "Application Service" {
                shape Hexagon
                background #0288d1
                color #ffffff
            }
            element "Background Worker" {
                shape Component
                background #512da8
                color #ffffff
            }
            element "Scheduler" {
                shape Component
                background #7b1fa2
                color #ffffff
            }
            element "Cache / Message Broker" {
                shape Cylinder
                background #c2185b
                color #ffffff
            }
            element "Database" {
                shape Cylinder
                background #0d47a1
                color #ffffff
            }
            element "Object Storage" {
                shape Folder
                background #00695c
                color #ffffff
            }
        }
    }
}
