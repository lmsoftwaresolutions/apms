# APMS Deployment & Operations Architecture

## 1. Overview & Profiles

APMS is engineered to deploy seamlessly across environments ranging from single-server edge environments to enterprise multi-node cloud clusters.

---

## 2. Docker Compose Deployment (Profile XS / S)

For small-to-medium deployments (< 50 tenants, < 10,000 employees), the combined single-compose architecture provides low operational overhead:

```yaml
version: '3.8'

services:
  apms-app:
    image: apms/backend:latest
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://apms_user:${DB_PASSWORD}@postgres:5432/apms_db
      - REDIS_URL=redis://redis:6379/0
      - APP_ENV=production
      - ENCRYPTION_MASTER_KEY=${MASTER_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  apms-worker:
    image: apms/backend:latest
    restart: unless-stopped
    command: celery -A app.core.tasks worker --loglevel=info -c 4
    environment:
      - DATABASE_URL=postgresql+asyncpg://apms_user:${DB_PASSWORD}@postgres:5432/apms_db
      - REDIS_URL=redis://redis:6379/0
      - ENCRYPTION_MASTER_KEY=${MASTER_KEY}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=apms_db
      - POSTGRES_USER=apms_user
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

---

## 3. Database Migration Procedures (Alembic)

Database schema migrations are strictly governed to avoid locking high-volume tables or disrupting RLS policies.

### 3.1 Migration Guidelines
1. **Always Set RLS in Migrations**:
   When creating a new tenant-scoped table in Alembic:
   ```python
   op.create_table(...)
   op.execute("ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;")
   op.execute("ALTER TABLE new_table FORCE ROW LEVEL SECURITY;")
   op.execute("""
       CREATE POLICY tenant_isolation_policy ON new_table
       FOR ALL
       USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
       WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
   """)
   ```
2. **Zero-Downtime Column Additions**:
   Add new columns as nullable, populate via asynchronous background script, then add constraints.
3. **Partition Maintenance**:
   A periodic cron task executes `apms partition create-upcoming` to ensure monthly partitions exist at least 2 months ahead.

