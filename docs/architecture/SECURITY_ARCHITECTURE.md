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

---

## 2. Field-Level Envelope Encryption

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

