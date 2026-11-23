export type Tenant = { id: string; display_name: string; logo_url: string | null };
export type Me = {
  id: string;
  email: string;
  full_name: string;
  tenant: Tenant;
  permissions: string[];
};

export type Branch = { id: string; name: string; code: string; is_active: boolean };
export type Department = {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  parent_dept_id?: string | null;
  is_active: boolean;
};

export type Role = { id: string; code: string; name: string; is_system: boolean; permissions: string[] };
export type Permission = { code: string; module: string; resource: string; action: string; description: string };
export type DirectoryUser = { id: string; email: string; full_name: string; is_active: boolean; roles: string[] };

export type Employee = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  branch_id: string;
  department_id: string | null;
  employee_code: string;
  full_name: string;
  designation: string | null;
  date_of_joining: string;
  date_of_birth: string | null;
  employment_type: string;
  probation_end_date: string | null;
  confirmation_date: string | null;
  pan_masked?: string | null;
  aadhaar_masked?: string | null;
  bank_account_masked?: string | null;
  bank_ifsc_masked?: string | null;
  epf_uan: string | null;
  esic_number: string | null;
  is_active: boolean;
  biometric_consent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeCreateInput = {
  employee_code: string;
  full_name: string;
  branch_id: string;
  department_id?: string | null;
  user_id?: string | null;
  designation?: string | null;
  date_of_joining: string;
  date_of_birth?: string | null;
  employment_type: string;
  probation_end_date?: string | null;
  confirmation_date?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  epf_uan?: string | null;
  esic_number?: string | null;
  biometric_consent: boolean;
  is_active: boolean;
};

export type ShiftSession = {
  id?: string;
  session_order: number;
  name: string;
  start_time: string;
  end_time: string;
  pre_window_minutes: number;
  post_window_minutes: number;
  grace_period_late_minutes: number;
  grace_period_early_minutes: number;
  min_presence_ratio: number;
  break_duration_minutes: number;
  is_overnight?: boolean;
};

export type ShiftTemplate = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  shift_type: string;
  color_code: string | null;
  is_overnight: boolean;
  is_active: boolean;
  sessions: ShiftSession[];
  created_at: string;
  updated_at: string;
};

export type ShiftTemplateCreateInput = {
  code: string;
  name: string;
  shift_type: string;
  color_code?: string | null;
  sessions: ShiftSession[];
};

export type RosterDayMapping = {
  day_index: number;
  shift_template_id: string | null;
  is_rest_day: boolean;
};

export type RosterPattern = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  cycle_length_days: number;
  day_shift_mapping: RosterDayMapping[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DatedShiftInstance = {
  id: string;
  tenant_id: string;
  employee_id: string;
  calendar_date: string;
  shift_template_id: string | null;
  roster_pattern_id: string | null;
  status: string;
  resolution_mode: string;
  sessions: ShiftSession[];
  is_rest_day: boolean;
  is_adhoc_modified: boolean;
  modified_by_user_id: string | null;
  modification_reason: string | null;
  modified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyAttendance = {
  id: string;
  tenant_id: string;
  employee_id: string;
  calendar_date: string;
  dated_shift_instance_id: string | null;
  status: string;
  worked_duration_minutes: number;
  scheduled_duration_minutes: number;
  worked_ratio: number;
  late_minutes: number;
  early_departure_minutes: number;
  overtime_minutes: number;
  is_single_punch: boolean;
  anomaly_code: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceTrace = {
  id: string;
  tenant_id: string;
  attendance_record_id: string;
  employee_id: string;
  calendar_date: string;
  trace_payload: Record<string, any>;
  evaluated_at: string;
};

export type PunchEvent = {
  id: string;
  tenant_id: string;
  raw_envelope_id: string;
  employee_id: string;
  punch_time: string;
  punch_direction: string;
  source: string;
  status: string;
  location_meta?: any;
  created_at: string;
};

const TOKEN_KEY = "apms.token";

export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function readError(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = body.detail || body.title || detail;
  } catch {}
  throw new Error(detail);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) await readError(response);
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

export const api = {
  // Auth & Tenant
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<Me>("/api/v1/auth/me"),
  updateTenant: (display_name: string) =>
    request<Tenant>("/api/v1/auth/tenant", { method: "PATCH", body: JSON.stringify({ display_name }) }),

  // Branches
  branches: () => request<Branch[]>("/api/v1/branches"),
  createBranch: (name: string, code: string) =>
    request<Branch>("/api/v1/branches", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ name, code }),
    }),
  updateBranch: (id: string, body: Partial<Pick<Branch, "name" | "code" | "is_active">>) =>
    request<Branch>(`/api/v1/branches/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBranch: (id: string) => request(`/api/v1/branches/${id}`, { method: "DELETE" }),

  // Departments
  departments: (branchId?: string) =>
    request<Department[]>(branchId ? `/api/v1/departments?branch_id=${encodeURIComponent(branchId)}` : "/api/v1/departments"),
  createDepartment: (branch_id: string, name: string, code: string, parent_dept_id?: string | null) =>
    request<Department>("/api/v1/departments", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ branch_id, name, code, parent_dept_id: parent_dept_id || null }),
    }),
  updateDepartment: (id: string, body: Partial<Pick<Department, "name" | "code" | "branch_id" | "is_active" | "parent_dept_id">>) =>
    request<Department>(`/api/v1/departments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDepartment: (id: string) => request(`/api/v1/departments/${id}`, { method: "DELETE" }),

  // IAM & Roles
  roles: () => request<Role[]>("/api/v1/roles"),
  permissions: () => request<Permission[]>("/api/v1/permissions"),
  createRole: (code: string, name: string, permissions: string[]) =>
    request<Role>("/api/v1/roles", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ code, name, permissions }),
    }),
  updateRole: (id: string, payload: { name?: string; permissions?: string[] }) =>
    request<Role>(`/api/v1/roles/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRole: (id: string) => request(`/api/v1/roles/${id}`, { method: "DELETE" }),
  users: () => request<DirectoryUser[]>("/api/v1/users"),
  assignRole: (userId: string, roleId: string) =>
    request<DirectoryUser>(`/api/v1/users/${userId}/roles`, {
      method: "POST",
      body: JSON.stringify({ role_id: roleId }),
    }),
  unassignRole: (userId: string, roleId: string) =>
    request(`/api/v1/users/${userId}/roles/${roleId}`, { method: "DELETE" }),

  // Employees
  employees: (params?: { branch_id?: string; department_id?: string; is_active?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.branch_id) q.set("branch_id", params.branch_id);
    if (params?.department_id) q.set("department_id", params.department_id);
    if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
    const str = q.toString();
    return request<Employee[]>(str ? `/api/v1/employees?${str}` : "/api/v1/employees");
  },
  getEmployee: (id: string) => request<Employee>(`/api/v1/employees/${id}`),
  createEmployee: (payload: EmployeeCreateInput) =>
    request<Employee>("/api/v1/employees", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(payload),
    }),
  updateEmployee: (id: string, payload: Partial<EmployeeCreateInput>) =>
    request<Employee>(`/api/v1/employees/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteEmployee: (id: string) => request(`/api/v1/employees/${id}`, { method: "DELETE" }),

  // Shifts
  shiftTemplates: (activeOnly = false) =>
    request<ShiftTemplate[]>(activeOnly ? "/api/v1/shifts/templates?active_only=true" : "/api/v1/shifts/templates"),
  getShiftTemplate: (id: string) => request<ShiftTemplate>(`/api/v1/shifts/templates/${id}`),
  createShiftTemplate: (payload: ShiftTemplateCreateInput) =>
    request<ShiftTemplate>("/api/v1/shifts/templates", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(payload),
    }),
  updateShiftTemplate: (id: string, payload: Partial<ShiftTemplateCreateInput & { is_active: boolean }>) =>
    request<ShiftTemplate>(`/api/v1/shifts/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteShiftTemplate: (id: string) => request(`/api/v1/shifts/templates/${id}`, { method: "DELETE" }),

  // Roster
  rosterPatterns: () => request<RosterPattern[]>("/api/v1/roster/patterns"),
  createRosterPattern: (payload: { code: string; name: string; cycle_length_days: number; day_shift_mapping: RosterDayMapping[] }) =>
    request<RosterPattern>("/api/v1/roster/patterns", { method: "POST", body: JSON.stringify(payload) }),
  materializeRoster: (payload: {
    employee_ids: string[];
    start_date: string;
    days?: number;
    shift_template_id?: string | null;
    roster_pattern_id?: string | null;
  }) =>
    request<{ total_materialized: number; employees_count: number; start_date: string; end_date: string }>(
      "/api/v1/roster/materialize",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  rosterInstances: (params: { employee_id?: string; start_date?: string; end_date?: string }) => {
    const q = new URLSearchParams();
    if (params.employee_id) q.set("employee_id", params.employee_id);
    if (params.start_date) q.set("start_date", params.start_date);
    if (params.end_date) q.set("end_date", params.end_date);
    const str = q.toString();
    return request<DatedShiftInstance[]>(str ? `/api/v1/roster/instances?${str}` : "/api/v1/roster/instances");
  },
  overrideShiftInstance: (id: string, payload: { shift_template_id?: string | null; is_rest_day: boolean; reason: string }) =>
    request<DatedShiftInstance>(`/api/v1/roster/instances/${id}/override`, { method: "PUT", body: JSON.stringify(payload) }),
  cancelShiftInstance: (id: string, reason: string) =>
    request<DatedShiftInstance>(`/api/v1/roster/instances/${id}/cancel`, { method: "PUT", body: JSON.stringify({ reason }) }),

  // Punches
  punches: (params?: { employee_id?: string; start_time?: string; end_time?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.employee_id) q.set("employee_id", params.employee_id);
    if (params?.start_time) q.set("start_time", params.start_time);
    if (params?.end_time) q.set("end_time", params.end_time);
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    const str = q.toString();
    return request<PunchEvent[]>(str ? `/api/v1/punches?${str}` : "/api/v1/punches");
  },

  // Attendance
  dailyAttendance: (params: { employee_id?: string; start_date?: string; end_date?: string }) => {
    const q = new URLSearchParams();
    if (params.employee_id) q.set("employee_id", params.employee_id);
    if (params.start_date) q.set("start_date", params.start_date);
    if (params.end_date) q.set("end_date", params.end_date);
    const str = q.toString();
    return request<DailyAttendance[]>(str ? `/api/v1/attendance/daily?${str}` : "/api/v1/attendance/daily");
  },
  getAttendanceTrace: (recordId: string) => request<AttendanceTrace>(`/api/v1/attendance/${recordId}/trace`),
  recalculateAttendance: (payload: { employee_id: string; calendar_date: string }) =>
    request<DailyAttendance>("/api/v1/attendance/recalculate", { method: "POST", body: JSON.stringify(payload) }),
};
