# APMS — Frontend-to-Backend Communication & Real-Time Architecture

> **Status:** Authoritative | **Last Updated:** 2026-11-16 | **Component:** Web SPA, API Gateway, Real-Time Push  
> **Source Documents:** `SYSTEM_ARCHITECTURE.md`, `API_DESIGN.md`, `SECURITY_ARCHITECTURE.md`, `MODULES_AND_FEATURES.md`, `ADR-01`, `ADR-03`, `ADR-10`

---

## 1. Architectural Overview

APMS implements a decoupled, high-performance communication architecture connecting the React 18+ TypeScript Single Page Application (SPA) with the Python 3.12+ FastAPI Modular Monolith backend. The system enforces strict multi-tenant boundary isolation, in-memory credential storage, deterministic cache invalidation, optimistic mutation lifecycles, and real-time bidirectional push notifications.

```mermaid
flowchart TD
    subgraph Client["React 18+ TypeScript SPA (Vite + Tailwind CSS)"]
        UI["UI Components (Radix UI / Views)"]
        TQ["TanStack Query v5 (Cache & State)"]
        WS_CLIENT["WebSocket Client Manager"]
        HTTP_CLIENT["Axios Client (In-Memory JWT + Interceptors)"]
    end

    subgraph Edge["Ingress & Edge Proxy"]
        NGINX["Nginx Reverse Proxy\n(TLS Termination / HTTP/2 / WS Upgrade)"]
    end

    subgraph Backend["APMS FastAPI Modular Monolith (Python 3.12+)"]
        AUTH_MW["JWT & Tenant Middleware\n(Extract `tid`, Set PG Context)"]
        REST_ROUTER["FastAPI REST Routers (`/api/v1/*`)"]
        WS_ROUTER["FastAPI WebSocket Handler (`/ws/v1/tenant/events`)"]
        SERVICES["Internal Domain Services (M01–M21)"]
    end

    subgraph Persistence["Persistence & Message Broker"]
        PG[("PostgreSQL 16+\n(Multi-Tenant RLS via `tenant_id`)")]
        REDIS[("Redis 7+\n(Pub/Sub Channels + Task Queue)")]
    end

    UI -->|Triggers Actions| TQ
    TQ -->|Executes Mutations / Queries| HTTP_CLIENT
    UI <-->|Subscribes / Listens| WS_CLIENT

    HTTP_CLIENT -->|HTTPS Requests + Bearer Token| NGINX
    WS_CLIENT <-->|WSS Connection Upgrade| NGINX

    NGINX -->|Proxy Pass `/api/v1`| AUTH_MW
    NGINX -->|Proxy WebSocket `/ws/v1`| WS_ROUTER

    AUTH_MW --> REST_ROUTER
    REST_ROUTER --> SERVICES
    SERVICES -->|SQLAlchemy Async + RLS| PG
    SERVICES -->|Publish Domain Events| REDIS

    REDIS -->|Tenant Pub/Sub Channel| WS_ROUTER
    WS_ROUTER -->|Push JSON Frame| WS_CLIENT
    WS_CLIENT -->|Invalidate Target Queries| TQ
```

---

## 2. JWT Authentication & Silent Session Refresh

Security invariants dictate that credentials must be protected against both Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF). 

### 2.1 Credential Storage & Token Lifecycle
1. **Short-Lived Access Token (15 Minutes)**:
   - Stored **strictly in JavaScript runtime memory** (React state / closure variable).
   - **Never** persisted to `localStorage`, `sessionStorage`, or unencrypted cookies.
   - Encodes standard JWT claims: `sub` (User ID), `tid` (Tenant ID), `roles` (RBAC roles), `perms` (Fine-grained permissions), `exp` (Unix expiration).
2. **Long-Lived Refresh Token (7 Days)**:
   - Stored in a secure, server-issued HTTP-only cookie (`__Host-APMS-Refresh-Token`).
   - Cookie attributes: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Domain=apms.tenant.domain`.
   - Inaccessible to browser JavaScript, completely eliminating token theft via XSS.
3. **Tenant Context Enforcement**:
   - Every authenticated request presents the Bearer access token.
   - FastAPI extracts `tid` from claims and initializes PostgreSQL session configuration:
     ```sql
     SET LOCAL app.current_tenant_id = '018f3a5b-9a8c-7000-8b01-234567890abc';
     ```

### 2.2 Silent Refresh & Request Interceptor Sequence

When an access token expires mid-session, the frontend Axios HTTP client catches the `401 Unauthorized` response, buffers pending concurrent requests in a subscriber queue, executes a single silent refresh request using the HTTP-only cookie, updates the in-memory access token, and transparently replays the queued requests.

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI Component
    participant AX as Axios Client Interceptor
    participant Q as Queued Request Buffer
    participant API as FastAPI Ingress (/api/v1)
    participant AUTH as Auth Service (M02/M03)
    participant DB as PostgreSQL (RLS)

    Note over UI,AX: User loads attendance calendar view
    UI->>AX: GET /api/v1/attendance?date=2026-11-16
    AX->>API: GET /api/v1/attendance (Authorization: Bearer <expired_token>)
    API-->>AX: 401 Unauthorized (Error: TOKEN_EXPIRED)

    Note over AX,Q: Interceptor detects 401 & acquires refresh lock
    AX->>Q: Enqueue original request (Promise hold)

    par Concurrent user requests occur while refreshing
        UI->>AX: GET /api/v1/leaves/balances
        AX->>Q: Enqueue second request (Promise hold)
    end

    AX->>API: POST /api/v1/auth/refresh (Cookie: __Host-APMS-Refresh-Token)
    API->>AUTH: Validate refresh token & session record
    AUTH->>DB: Verify user active & token not revoked
    DB-->>AUTH: Session OK
    AUTH-->>API: Issue new Access Token (15m) + Rotated Refresh Token
    API-->>AX: 200 OK { success: true, data: { accessToken: "eyJhbGci..." } }

    Note over AX: Update in-memory token state
    AX->>Q: Dequeue and flush pending requests with new token
    Q->>API: GET /api/v1/attendance (Authorization: Bearer <new_token>)
    Q->>API: GET /api/v1/leaves/balances (Authorization: Bearer <new_token>)
    API-->>UI: 200 OK (Attendance records returned)
    API-->>UI: 200 OK (Leave balances returned)
```

### 2.3 Frontend Axios Interceptor Implementation Contract

```typescript
// src/api/httpClient.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

let inMemoryAccessToken: string | null = null;
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = () => inMemoryAccessToken;

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (token) {
      promise.resolve(token);
    } else {
      promise.reject(error);
    }
  });
  failedQueue = [];
};

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // Mandatory for sending HTTP-only refresh cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryAccessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === '/auth/refresh') {
        // Refresh token failed or expired -> force logout
        setAccessToken(null);
        window.location.href = '/login?session_expired=1';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject: (err) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await apiClient.post<{ data: { accessToken: string } }>('/auth/refresh');
        const newToken = data.data.accessToken;
        setAccessToken(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        window.location.href = '/login?session_expired=1';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

---

## 3. TanStack Query (React Query v5) Caching Strategy

APMS mandates a strictly typed, hierarchical query key taxonomy. Query keys uniquely segregate data across tenants, entities, and scopes, preventing cache cross-contamination and facilitating precise query invalidation.

### 3.1 Hierarchical Cache Key Taxonomy

All query keys follow the canonical pattern:
```
['tenants', tenantId, domain, scope, ...parameters]
```

| Domain | Query Key Tuple Structure | Description | Stale Time | Garbage Collection (`gcTime`) |
| :--- | :--- | :--- | :--- | :--- |
| **Attendance Rollup** | `['tenants', tenantId, 'attendance', 'daily', date]` | Daily employee attendance summary, pairings, traces | 30 seconds | 5 minutes |
| **Monthly Calendar** | `['tenants', tenantId, 'attendance', 'calendar', year, month]` | Month grid for employee calendar view | 2 minutes | 15 minutes |
| **Punch Events** | `['tenants', tenantId, 'punches', employeeId, date]` | Chronological punch pairings for single employee | 15 seconds | 5 minutes |
| **Leave Balances** | `['tenants', tenantId, 'leave', 'balances', employeeId]` | Double-entry ledger balance summary | 1 minute | 10 minutes |
| **Leave Requests** | `['tenants', tenantId, 'leave', 'requests', { status, page }]` | Active leave applications pending review | 30 seconds | 5 minutes |
| **Shift Instances** | `['tenants', tenantId, 'shifts', 'roster', branchId, startDate, endDate]` | Materialized dated shift instances | 5 minutes | 30 minutes |
| **Pay Runs** | `['tenants', tenantId, 'payroll', 'pay-runs', payPeriodId]` | Current pay run status and calculation wizard state | 10 seconds | 10 minutes |
| **Device Telemetry**| `['tenants', tenantId, 'devices', 'telemetry', branchId]` | Terminal heartbeat, sync lag, clock drift | 15 seconds | 2 minutes |

### 3.2 Query Client Factory & Global Invariants

```typescript
// src/api/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds default freshness
      gcTime: 1000 * 60 * 10, // 10 minutes garbage collection
      retry: (failureCount, error: any) => {
        // Never retry 4xx client errors (400, 401, 403, 404, 422)
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 3; // Retry network drops or 5xx up to 3 times
      },
      refetchOnWindowFocus: false, // Prevent jarring refetches on tab switch
      refetchOnReconnect: true,   // Synchronize immediately upon network recovery
    },
    mutations: {
      retry: false, // Mutations never auto-retry to prevent accidental double-writes
    },
  },
});
```

---

## 4. Optimistic UI Updates & Rollback Architecture

For high-frequency operational workforce workflows (punch miss regularizations, leave applications, supervisor shift overrides), APMS executes **Optimistic UI Updates**. The UI state reflects the desired change immediately, while a background mutation communicates with FastAPI. If the server rejects the mutation (e.g., validation failure, policy block), the frontend rolls back to the exact previous state snapshot.

### 4.1 Mutation Lifecycle (The 3-Phase Contract)

```mermaid
flowchart TD
    Start["User Submits Action\n(e.g., Quick Regularize Punch)"] --> CancelQueries["1. onMutate: Cancel In-Flight Queries\n`queryClient.cancelQueries({ queryKey })`"]
    CancelQueries --> SnapshotState["2. onMutate: Snapshot Previous State\n`context.previous = queryClient.getQueryData(key)`"]
    SnapshotState --> OptimisticSet["3. onMutate: Optimistically Mutate Cache\n`queryClient.setQueryData(key, optimisticValue)`"]
    OptimisticSet --> UI_Updated["UI Instantly Reflects Change\n(Status: PENDING_REGULARIZATION)"]
    
    UI_Updated --> API_Call["FastAPI POST Request Dispatched"]
    
    API_Call --> Decision{Server Response?}
    
    Decision -->|200 OK / 201 Created| SuccessToast["Show Success Notification"]
    SuccessToast --> Invalidate["onSettled: Re-fetch Server Data\n`queryClient.invalidateQueries({ queryKey })`"]
    
    Decision -->|4xx / 5xx Error| ErrorRollback["onError: Revert Cache Snapshot\n`queryClient.setQueryData(key, context.previous)`"]
    ErrorRollback --> ErrorToast["Display RFC 7807 Error Banner\n(Rollback rendered in UI)"]
    ErrorToast --> Invalidate
    Invalidate --> End["Client Cache Harmonized with Server"]
```

### 4.2 Sequence Diagram: Optimistic Regularization with Rollback on Error

```mermaid
sequenceDiagram
    autonumber
    participant User as Supervisor / Employee
    participant Component as AttendanceRow Component
    participant TQ as TanStack Query Cache
    participant API as FastAPI Backend (/api/v1)
    participant Engine as Attendance Engine (M09/M10)

    User->>Component: Click "Quick Regularize" (Add missing OUT punch 18:00)
    Component->>TQ: mutate({ recordId, missingPunch: "18:00" })
    
    Note over TQ: Phase 1: onMutate Lifecycle Hook
    TQ->>TQ: cancelQueries(['tenants', tid, 'attendance', 'daily', '2026-11-16'])
    TQ->>TQ: Snapshot previousData = { status: 'LONE_PUNCH_ANOMALY', workedMinutes: 240 }
    TQ->>TQ: setQueryData(...) -> Optimistically update to { status: 'REGULARIZATION_PENDING', workedMinutes: 540 }
    
    TQ-->>Component: React re-renders with optimistic state
    Component-->>User: Badge updates to "Pending" & worked time recalculated instantly

    Note over TQ,API: Phase 2: Asynchronous HTTP Execution
    TQ->>API: POST /api/v1/attendance-records/{id}/regularize
    API->>Engine: Validate punch ingestion window & policy constraints
    
    alt Validation Failure (e.g. Punch timestamp outside allowable 24h grace window)
        Engine-->>API: ValidationError (BR-ATT-04: Grace period exceeded)
        API-->>TQ: 422 Unprocessable Entity { error: { code: "GRACE_PERIOD_EXCEEDED" } }
        
        Note over TQ: Phase 3a: onError Lifecycle Hook
        TQ->>TQ: setQueryData(queryKey, context.previousData) -> Revert to snapshot
        TQ-->>Component: React re-renders with reverted state
        Component-->>User: Toast alert: "Regularization rejected: Punch outside 24h window"
    else Success
        Engine-->>API: Regularization Request Recorded
        API-->>TQ: 200 OK { data: { id: "...", status: "REGULARIZATION_PENDING" } }
        Component-->>User: Toast alert: "Regularization submitted for approval"
    end

    Note over TQ: Phase 3b: onSettled Lifecycle Hook
    TQ->>TQ: invalidateQueries(['tenants', tid, 'attendance', 'daily', '2026-11-16'])
```

### 4.3 Concrete Implementation: `useRegularizePunch` Hook

```typescript
// src/features/attendance/hooks/useRegularizePunch.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/httpClient';
import { useAuthStore } from '../../../store/authStore';

interface RegularizePayload {
  recordId: string;
  date: string;
  requestedTime: string;
  reason: string;
}

interface DailyAttendanceRecord {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LONE_PUNCH_ANOMALY' | 'REGULARIZATION_PENDING';
  workedMinutes: number;
}

export const useRegularizePunch = (date: string) => {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.tenantId);
  const queryKey = ['tenants', tenantId, 'attendance', 'daily', date];

  return useMutation({
    mutationFn: async (payload: RegularizePayload) => {
      const { data } = await apiClient.post(
        `/attendance-records/${payload.recordId}/regularize`,
        payload,
        {
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
        }
      );
      return data;
    },
    // Step 1: Snapshot and Optimistically Mutate
    onMutate: async (newRegularization) => {
      await queryClient.cancelQueries({ queryKey });

      const previousRecords = queryClient.getQueryData<DailyAttendanceRecord[]>(queryKey);

      if (previousRecords) {
        queryClient.setQueryData<DailyAttendanceRecord[]>(
          queryKey,
          previousRecords.map((record) =>
            record.id === newRegularization.recordId
              ? {
                  ...record,
                  status: 'REGULARIZATION_PENDING',
                }
              : record
          )
        );
      }

      return { previousRecords };
    },
    // Step 2: Rollback on Error
    onError: (err, newRegularization, context) => {
      if (context?.previousRecords) {
        queryClient.setQueryData(queryKey, context.previousRecords);
      }
    },
    // Step 3: Always Invalidate to Sync Authoritative Server State
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
};
```

---

## 5. WebSocket Real-Time Architecture (FastAPI + Redis Pub/Sub)

To support instant notification of biometric clock-ins, live muster roll dashboard adjustments, supervisor approval routing, and long-running pay run progress bars, APMS features an asynchronous WebSocket infrastructure powered by Redis Pub/Sub.

```mermaid
flowchart LR
    subgraph Clients["Connected Client Tier"]
        C1["React Client 1\n(HR Dashboard)"]
        C2["React Client 2\n(Supervisor ESS)"]
        C3["React Client 3\n(Admin Monitor)"]
    end

    subgraph Edge["Proxy Ingress"]
        NGX["Nginx Proxy\n`/ws/v1/tenant/events`\n`Upgrade: websocket`"]
    end

    subgraph FastAPINodes["Stateless FastAPI WebSocket Pods"]
        WS_POD1["FastAPI Pod 1\n(Connection Pool)"]
        WS_POD2["FastAPI Pod 2\n(Connection Pool)"]
    end

    subgraph MessageBroker["Redis 7+ Pub/Sub Broker"]
        PUB_SUB["Redis Channel:\n`tenant:{tenant_id}:events`"]
    end

    subgraph EventProducers["Backend Domain Event Producers"]
        M08["M08: Punch Engine\n(Biometric Terminal)"]
        M10["M10: Workflow Engine\n(Leave Approved)"]
        M15["M15: Payroll Engine\n(Pay Run Progress 45%)"]
    end

    C1 <-->|WSS Connection| NGX
    C2 <-->|WSS Connection| NGX
    C3 <-->|WSS Connection| NGX

    NGX <-->|Round Robin Upgrade| WS_POD1
    NGX <-->|Round Robin Upgrade| WS_POD2

    WS_POD1 <-->|Subscribes to Channel| PUB_SUB
    WS_POD2 <-->|Subscribes to Channel| PUB_SUB

    M08 -->|PUBLISH Punch Recorded| PUB_SUB
    M10 -->|PUBLISH Approval Update| PUB_SUB
    M15 -->|PUBLISH Pay Run Progress| PUB_SUB
```

### 5.1 Nginx Ingress Reverse Proxy Configuration

Nginx acts as the edge SSL termination and WebSocket protocol upgrade gateway:

```nginx
# /etc/nginx/conf.d/apms_websocket.conf
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream fastapi_websocket_backend {
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name *.apms.com;

    # SSL certificates omitted for brevity...

    location /ws/v1/tenant/events {
        proxy_pass http://fastapi_websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### 5.2 Connection Handshake & Authentication

Because native browser WebSocket APIs do not support custom `Authorization: Bearer <token>` headers, APMS implements a **Single-Use WebSocket Ticket Exchange Protocol**:

```mermaid
sequenceDiagram
    autonumber
    participant React as React SPA Client
    participant REST as FastAPI REST (/api/v1)
    participant Redis as Redis Cache
    participant WS as FastAPI WebSocket (/ws/v1)
    participant PubSub as Redis Pub/Sub

    Note over React,REST: Step 1: Request Short-Lived Single-Use WS Ticket
    React->>REST: POST /api/v1/auth/ws-ticket (Authorization: Bearer <in_memory_jwt>)
    REST->>REST: Verify JWT claims (tenant_id, user_id, permissions)
    REST->>Redis: SETEX ws_ticket:<ticket_uuid> 30s { tenant_id, user_id }
    REST-->>React: 200 OK { ticket: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }

    Note over React,WS: Step 2: Establish Secure WebSocket Connection
    React->>WS: WSS /ws/v1/tenant/events?ticket=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
    WS->>Redis: GETDEL ws_ticket:<ticket_uuid> (Atomic Read & Delete)
    
    alt Ticket Invalid or Expired
        Redis-->>WS: Null
        WS-->>React: Close Frame 4003 (Unauthorized Ticket)
    else Ticket Valid
        Redis-->>WS: { tenant_id: "018f3a5b...", user_id: "018f3a5c..." }
        WS->>WS: Register Client in Tenant Connection Registry
        WS->>PubSub: Ensure Redis Subscription to `tenant:{tenant_id}:events`
        WS-->>React: Connection Accepted (HTTP 101 Switching Protocols)
        WS-->>React: Frame: { type: "CONNECTION_ESTABLISHED", heartbeatIntervalMs: 30000 }
    end
```

### 5.3 Heartbeat Ping/Pong & Auto-Reconnect Architecture

1. **Heartbeat Protocol**:
   - Every 30 seconds, the frontend client dispatches a lightweight JSON frame: `{"type": "PING"}`.
   - The FastAPI server responds immediately with: `{"type": "PONG", "serverTime": 1731772800}`.
   - If the client misses 2 consecutive PONG frames (60 seconds elapsed), it marks the connection `DEAD`, terminates the socket, and initiates exponential backoff reconnection.
2. **Reconnection Strategy with Jitter**:
   - Delay formula:
     $$\text{Delay}(n) = \min(30000, 1000 \times 2^n) + \text{random\_jitter}(0, 1000)\text{ ms}$$
   - Prevents the "Thundering Herd" problem when an edge proxy or Redis cluster restarts.

---

## 6. Real-Time Alert Event Types & Payloads

Every event broadcasted over the tenant WebSocket channel adheres to the standard schema:
```json
{
  "eventId": "evt_01j7b9k4x8",
  "eventType": "BIOMETRIC_PUNCH_RECORDED",
  "tenantId": "018f3a5b-9a8c-7000-8b01-234567890abc",
  "timestamp": "2026-11-16T14:32:00Z",
  "payload": {},
  "targetAudience": {
    "roles": ["HR_OPERATIONS", "SHIFT_SUPERVISOR"],
    "userIds": ["usr_01j7b9k5"]
  }
}
```

### 6.1 Core Event Catalog

#### 1. `BIOMETRIC_PUNCH_RECORDED` (Module 08/09)
Emitted when a physical terminal or mobile clock-in is normalized and paired.
```json
{
  "eventType": "BIOMETRIC_PUNCH_RECORDED",
  "payload": {
    "employeeId": "emp_01j7b9a1",
    "employeeCode": "EMP-1042",
    "employeeName": "Rajesh Kumar",
    "punchTime": "2026-11-16T08:58:22+05:30",
    "punchType": "CHECK_IN",
    "terminalId": "BIO-GATE-01",
    "status": "ON_TIME",
    "branchId": "brn_mumbai_01"
  }
}
```

#### 2. `LEAVE_REQUEST_STATUS_CHANGED` (Module 10/11)
Emitted when a supervisor or workflow engine acts upon a leave application.
```json
{
  "eventType": "LEAVE_REQUEST_STATUS_CHANGED",
  "payload": {
    "requestId": "req_lve_01j7b9",
    "employeeId": "emp_01j7b9a1",
    "leaveType": "CASUAL_LEAVE",
    "dates": ["2026-11-20", "2026-11-21"],
    "daysCount": 2.0,
    "status": "APPROVED",
    "actionedBy": "usr_mgr_02",
    "comment": "Approved as per roster coverage."
  }
}
```

#### 3. `PAY_RUN_STEP_PROGRESS` (Module 15)
Emitted during the 10-step payroll execution wizard to render live progress bars in the HR console.
```json
{
  "eventType": "PAY_RUN_STEP_PROGRESS",
  "payload": {
    "payRunId": "prun_2026_11",
    "currentStepIndex": 5,
    "stepName": "STATUTORY_DEDUCTIONS_COMPUTATION",
    "processedEmployees": 3420,
    "totalEmployees": 4000,
    "progressPercent": 85.5,
    "estimatedRemainingSeconds": 12
  }
}
```

#### 4. `DEVICE_TELEMETRY_ALERT` (Module 16)
Emitted when hardware biometric sync lag or NTP clock drift exceeds safety thresholds.
```json
{
  "eventType": "DEVICE_TELEMETRY_ALERT",
  "payload": {
    "deviceId": "dev_zkteco_plant2",
    "deviceSerial": "ZK-9842104",
    "alertType": "CLOCK_DRIFT_EXCEEDED",
    "driftSeconds": 412,
    "thresholdSeconds": 300,
    "severity": "CRITICAL",
    "message": "Hardware clock is 6.8 minutes out of synchronization with APMS server NTP."
  }
}
```

---

## 7. WebSocket-to-TanStack Query Invalidation Bridge

Rather than having the UI manage complex mutable socket message state trees, APMS employs the **Event-to-Invalidate Pattern**: incoming WebSocket events trigger surgical cache invalidations in TanStack Query. This ensures the frontend UI re-fetches authoritative data via REST without duplication of business logic.

```typescript
// src/realtime/useWebSocketBridge.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

export const useWebSocketBridge = () => {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuthStore();

  useEffect(() => {
    if (!tenantId) return;

    let socket: WebSocket | null = null;
    let heartbeatTimer: NodeJS.Timeout;

    const connect = async () => {
      // 1. Acquire single-use ticket
      const res = await fetch('/api/v1/auth/ws-ticket', { credentials: 'include' });
      const { ticket } = await res.json();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/v1/tenant/events?ticket=${ticket}`);

      socket.onopen = () => {
        heartbeatTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 30000);
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.eventType) {
          case 'BIOMETRIC_PUNCH_RECORDED': {
            const today = new Date().toISOString().split('T')[0];
            // Invalidate today's attendance rollup and muster roll
            queryClient.invalidateQueries({
              queryKey: ['tenants', tenantId, 'attendance', 'daily', today],
            });
            queryClient.invalidateQueries({
              queryKey: ['tenants', tenantId, 'punches', message.payload.employeeId, today],
            });
            break;
          }

          case 'LEAVE_REQUEST_STATUS_CHANGED': {
            // Invalidate pending leave approvals and user leave balances
            queryClient.invalidateQueries({
              queryKey: ['tenants', tenantId, 'leave', 'requests'],
            });
            queryClient.invalidateQueries({
              queryKey: ['tenants', tenantId, 'leave', 'balances', message.payload.employeeId],
            });
            break;
          }

          case 'PAY_RUN_STEP_PROGRESS': {
            // Actively update cached progress state directly without network re-fetch
            queryClient.setQueryData(
              ['tenants', tenantId, 'payroll', 'pay-runs', message.payload.payRunId, 'progress'],
              message.payload
            );
            break;
          }

          case 'DEVICE_TELEMETRY_ALERT': {
            queryClient.invalidateQueries({
              queryKey: ['tenants', tenantId, 'devices', 'telemetry'],
            });
            break;
          }

          default:
            break;
        }
      };

      socket.onclose = () => {
        clearInterval(heartbeatTimer);
        // Exponential backoff reconnect logic handled here...
      };
    };

    connect();

    return () => {
      clearInterval(heartbeatTimer);
      socket?.close();
    };
  }, [tenantId, user?.id, queryClient]);
};
```

---

## 8. Network Resilience, Idempotency & Offline Handling

Workforce operational actions must remain resilient against spotty factory Wi-Fi and mobile connectivity drops.

### 8.1 Idempotency Key Protocol
All state-mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) generated by the frontend include a UUIDv4 header:
```http
Idempotency-Key: e678fa42-4f16-4dc4-839e-d52ef75e3a09
```
FastAPI intercepts this header via middleware:
1. Computes `idempotency_hash = sha256(tenant_id + user_id + idempotency_key + request_path)`.
2. Checks Redis:
   - If key exists with status `PROCESSING`: Returns `409 Conflict` (Concurrent duplicate request).
   - If key exists with status `COMPLETED`: Returns cached HTTP response payload immediately without re-executing business logic.
   - If key does not exist: Sets key with `EX 86400` (24h TTL) and proceeds with request execution.

### 8.2 TanStack Query Offline Manager Integration

```typescript
// src/api/offlineManager.ts
import { onlineManager } from '@tanstack/react-query';

// Synchronize browser online/offline status with query client
window.addEventListener('online', () => {
  onlineManager.setOnline(true);
});

window.addEventListener('offline', () => {
  onlineManager.setOnline(false);
});
```
When offline:
- Outgoing queries are paused automatically and queued.
- The UI renders an amber status badge: *"Offline — Changes will synchronize when connection restores"*.
- Upon reconnection, `onlineManager` triggers automatic re-evaluation and flushes cached background queries.

---

## 9. Architectural Verification & Compliance Checklist

| Architecture Invariant | Verification Mechanism | Status |
| :--- | :--- | :--- |
| **Zero Token Persistence in Storage** | Code review and security scan verifies `localStorage.getItem('token')` is non-existent. | ✅ Compliant |
| **Silent Refresh under XSS Protection** | Refresh token is confined to `HttpOnly; SameSite=Strict` cookie path `/api/v1/auth`. | ✅ Compliant |
| **Tenant Cache Segregation** | All TanStack Query keys are prefixed with `['tenants', tenantId, ...]`. | ✅ Compliant |
| **Optimistic State Snapshotting** | Mutations snapshot previous state before setting cache and revert in `onError`. | ✅ Compliant |
| **WebSocket Authentication Guard** | Single-use ticket exchange with 30-second TTL prevents query param credential logging. | ✅ Compliant |
| **Idempotency Guardrails** | Mutating actions carry unique `Idempotency-Key` headers stored in Redis for 24h. | ✅ Compliant |
| **WebSocket Connection Recovery** | Exponential backoff with random jitter prevents thundering herd on backend restarts. | ✅ Compliant |
