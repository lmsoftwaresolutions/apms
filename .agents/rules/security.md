---
trigger: model_decision
description: Multi-tenant Row-Level Security, PII encryption, authorization checks, and DPDP Act compliance rules.
---

# APMS Security Invariants

## 1. Multi-Tenant Row-Level Security (RLS)
1. **Mandatory RLS Policies**: Every table with tenant-scoped data must enable and force Row-Level Security:
   ```sql
   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
   ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
   ```
2. **Context Setting**: Every database connection checkout must execute `SET LOCAL app.current_tenant_id = :tenant_id`. Bypassing this setting or running queries as superuser in application paths is strictly forbidden.
3. **Composite Foreign Keys**: All foreign key relationships on tenant tables must include `(tenant_id, foreign_id)` to prevent cross-tenant referencing.

## 2. Field-Level Encryption & Data Privacy
1. **PII Encryption**: Bank account numbers, IFSC codes, PAN, Aadhaar, and base salary numbers must be encrypted using AES-256-GCM before writing to the database.
2. **Plaintext Protection**: Unencrypted PII or auth secrets must never appear in application logs, error traces, or unmasked client API responses.
3. **DPDP Act 2023 Compliance**: Biometric consent must be recorded upon onboarding; former employee records must support masking/anonymization following the 8-year statutory retention expiration.

