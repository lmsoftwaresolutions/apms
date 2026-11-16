# APMS Security Architecture & Compliance

## 1. Multi-Tenant Isolation via Row-Level Security (RLS)

The paramount security requirement in APMS is complete, leak-proof tenant isolation. APMS achieves this through PostgreSQL native Row-Level Security (RLS), ensuring that even if an application bug omits a tenant filter in SQL, the database engine enforces tenant boundaries.

### 1.1 Implementation Architecture
1. **Connection Checkout**: When a database session is acquired from the connection pool, the application middleware executes:
   ```sql
   SET LOCAL app.current_tenant_id = :tenant_id;
   ```
2. **Policy Enforcement**: Every table scoped to a tenant has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
3. **Automated Cross-Tenant Testing**: Continuous integration runs automated isolation tests attempting to query Tenant B's data while authenticated as Tenant A. Any leaked row fails the build immediately.

### 1.2 Celery Background Worker Fail-Closed Context Manager
Celery workers operate outside the HTTP FastAPI request lifecycle. To prevent pooled connection cross-tenant context leaks or silent unauthenticated queries, all tenant-scoped background tasks enforce a mandatory context manager:
- Every task receives an explicit `tenant_id` parameter.
- The database session factory runs `SET LOCAL app.current_tenant_id = :tenant_id` at transaction start.
- On task completion (or error), the transaction is committed or rolled back, resetting the session configuration variable before returning the connection to the asyncpg connection pool.

---

## 2. Field-Level Envelope Encryption & Cryptographic Integrity

Sensitive Personal Identifiable Information (PII) and financial records must be encrypted before persistence to protect against database dump exposures.

### 2.1 Encrypted Fields
- Employee Bank Account Number, IFSC Code
- Permanent Account Number (PAN)
- Aadhaar Number / National Identification
- Base Salary Figures & CTC Breakdown

### 2.2 Key Management Architecture
- **Key Hierarchy**: Master Key (stored in AWS KMS / HashiCorp Vault) encrypts Tenant Data Encryption Keys (DEKs).
- **Algorithm**: AES-256-GCM authenticated encryption with random initialization vectors (IV).
- **Masking on Display**: In UI and standard API responses, sensitive fields are masked (e.g. `XXXX-XXXX-1234`), unmasked only upon explicit privileged admin action with audit logging.

### 2.3 Biometric Hardware Attestation & Ingestion Security
- **Edge Sync Agent**: Mutual TLS (mTLS) with pinned client certificates and HMAC-SHA256 request payload signatures (`X-Device-Signature: HMAC_SHA256(secret, payload + timestamp)`).
- **Legacy Devices**: Standalone push terminals without TLS/HMAC support are isolated to local factory LANs and terminated exclusively via the on-premises Edge Sync Agent.
- **Mobile Clock-In**: Device hardware integrity attestation (Google Play Integrity / Apple DeviceCheck) paired with ray-casting geofence validation.

### 2.4 Centralized Tamper-Evident Audit Trail (WORM Enforcement)
- **Forward Cryptographic Hash Chaining**: Every `audit_logs` entry computes `SHA-256(prev_entry_hash || tenant_id || payload)`. Any alteration breaks the cryptographic verification chain.
- **Database Privilege Revocation**: The application database role has `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs`, guaranteeing append-only Write-Once-Read-Many (WORM) storage.
- **Yearly Partitioning & Cold Storage**: Yearly range partitioning with automated 8-year archival to S3/MinIO Parquet cold vaults.

---

## 3. Role-Based Access Control (RBAC)

APMS defines five standard hierarchical roles:

| Role Code | Role Name | Scope & Permissions |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | Platform Super Admin | Cross-tenant platform maintenance, tenant provisioning, system health. |
| `TENANT_ADMIN` | Tenant Administrator | Full tenant configuration, billing, branch creation, security audit logs. |
| `HR_PAYROLL` | HR & Payroll Executive | Payroll wizard execution, leave administration, attendance overrides. |
| `SUPERVISOR` | Department Supervisor | Roster assignment, ad-hoc shift modifications, leave/overtime approvals. |
| `EMPLOYEE` | Employee (Self-Service) | Punch clock-in, personal calendar, leave application, payslip download. |

---

## 4. Digital Personal Data Protection (DPDP) Act 2023 Compliance

As an enterprise HRMS operating in India, APMS complies strictly with the DPDP Act 2023:

1. **Explicit Notice & Consent (`PRV-01`)**:
   - Biometric data capture requires digital employee consent during onboarding.
   - Purpose limitation: Biometric templates and punches are used solely for timekeeping and payroll.
2. **Right to Correction & Erasure (`PRV-02`)**:
   - Employees can request rectification of inaccurate personal records.
   - Upon employment termination and expiration of statutory tax retention (8 fiscal years), personal identifiers are anonymized/masked.
3. **Data Protection Officer (DPO) Logs**:
   - All access to unmasked PII and financial records generates immutable audit logs (`audit_logs` table).

