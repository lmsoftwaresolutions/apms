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

export type EmployeeRow = {
  id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
  designation_id: string | null;
  designation: string | null;
};

export type Employee = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  branch_id: string;
  department_id: string | null;
  designation_id: string | null;
  designation: string | null;
  employee_code: string;
  full_name: string;
  date_of_joining: string;
  date_of_birth: string | null;
  employment_type: string;
  probation_end_date: string | null;
  confirmation_date: string | null;
  pan_masked: string | null;
  aadhaar_masked: string | null;
  bank_account_masked: string | null;
  bank_ifsc_masked: string | null;
  epf_uan_masked: string | null;
  esic_number_masked: string | null;
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
  designation_id?: string | null;
  user_id?: string | null;
  designation?: string | null;
  date_of_joining: string;
  date_of_birth?: string | null;
  employment_type?: string;
  probation_end_date?: string | null;
  confirmation_date?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  epf_uan?: string | null;
  esic_number?: string | null;
  biometric_consent?: boolean;
  is_active?: boolean;
};

export type EmployeeUpdateInput = {
  full_name?: string | null;
  branch_id?: string | null;
  department_id?: string | null;
  designation_id?: string | null;
  user_id?: string | null;
  designation?: string | null;
  date_of_joining?: string | null;
  date_of_birth?: string | null;
  employment_type?: string | null;
  probation_end_date?: string | null;
  confirmation_date?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  epf_uan?: string | null;
  esic_number?: string | null;
  biometric_consent?: boolean | null;
  is_active?: boolean | null;
};

export type UnmaskPiiResult = Record<string, string | null>;

export type Designation = {
  id: string;
  department_id: string;
  name: string;
  code: string;
  description?: string | null;
  is_active: boolean;
};

export type Role = { id: string; code: string; name: string; is_system: boolean; permissions: string[] };

export type Permission = { code: string; module: string; resource: string; action: string; description: string };

export type DirectoryUser = { id: string; email: string; full_name: string; is_active: boolean; roles: string[] };

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
  } catch {
    /* private mode */
  }
}

async function readError(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = body.detail || body.title || detail;
  } catch {
    /* empty */
  }
  throw new Error(detail);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) await readError(response);
  if (response.status === 204 || response.status === 205) {
    return undefined as unknown as T;
  }
  const text = await response.text();
  if (!text || text.trim() === "") {
    return undefined as unknown as T;
  }
  return JSON.parse(text) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<Me>("/api/v1/auth/me"),
  updateTenant: (display_name: string) =>
    request<Tenant>("/api/v1/auth/tenant", { method: "PATCH", body: JSON.stringify({ display_name }) }),
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
  departments: (branchId?: string) =>
    request<Department[]>(branchId ? `/api/v1/departments?branch_id=${encodeURIComponent(branchId)}` : "/api/v1/departments"),
  createDepartment: (branch_id: string, name: string, code: string, parent_dept_id?: string | null) =>
    request<Department>("/api/v1/departments", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ branch_id, name, code, parent_dept_id: parent_dept_id || null }),
    }),
  updateDepartment: (
    id: string,
    body: Partial<Pick<Department, "name" | "code" | "branch_id" | "parent_dept_id" | "is_active">>,
  ) => request<Department>(`/api/v1/departments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDepartment: (id: string) => request(`/api/v1/departments/${id}`, { method: "DELETE" }),
  designations: (departmentId?: string) =>
    request<Designation[]>(
      departmentId ? `/api/v1/designations?department_id=${encodeURIComponent(departmentId)}` : "/api/v1/designations",
    ),
  createDesignation: (department_id: string, name: string, code: string, description?: string | null) =>
    request<Designation>("/api/v1/designations", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ department_id, name, code, description: description || null }),
    }),
  updateDesignation: (
    id: string,
    body: Partial<Pick<Designation, "name" | "code" | "description" | "is_active">>,
  ) => request<Designation>(`/api/v1/designations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDesignation: (id: string) => request(`/api/v1/designations/${id}`, { method: "DELETE" }),
  employees: (departmentId: string) =>
    request<EmployeeRow[]>(`/api/v1/employees?department_id=${encodeURIComponent(departmentId)}`),
  employeesList: (params?: { branch_id?: string; department_id?: string; is_active?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.branch_id) query.set("branch_id", params.branch_id);
    if (params?.department_id) query.set("department_id", params.department_id);
    if (params?.is_active !== undefined) query.set("is_active", String(params.is_active));
    const qs = query.toString();
    return request<Employee[]>(`/api/v1/employees${qs ? `?${qs}` : ""}`);
  },
  employee: (id: string) => request<Employee>(`/api/v1/employees/${id}`),
  createEmployee: (payload: EmployeeCreateInput) =>
    request<Employee>("/api/v1/employees", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(payload),
    }),
  updateEmployee: (id: string, payload: EmployeeUpdateInput) =>
    request<Employee>(`/api/v1/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteEmployee: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/v1/employees/${id}`, { method: "DELETE" }),
  unmaskPii: (id: string, fields: string[]) =>
    request<UnmaskPiiResult>(`/api/v1/employees/${id}/unmask`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    }),
  assignDesignation: (id: string, designation_id: string | null) =>
    request<EmployeeRow>(`/api/v1/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ designation_id }),
    }),
  roles: () => request<Role[]>("/api/v1/roles"),
  permissions: () => request<Permission[]>("/api/v1/permissions"),
  createRole: (code: string, name: string, permissions: string[]) =>
    request<Role>("/api/v1/roles", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ code, name, permissions }),
    }),
  updateRole: (id: string, permissions: string[]) =>
    request<Role>(`/api/v1/roles/${id}`, { method: "PATCH", body: JSON.stringify({ permissions }) }),
  users: () => request<DirectoryUser[]>("/api/v1/users"),
  createUser: (payload: { email: string; full_name: string; password?: string; role_id?: string }) =>
    request<DirectoryUser>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  assignRole: (userId: string, roleId: string) =>
    request<DirectoryUser>(`/api/v1/users/${userId}/roles`, {
      method: "POST",
      body: JSON.stringify({ role_id: roleId }),
    }),
  unassignRole: (userId: string, roleId: string) =>
    request<void>(`/api/v1/users/${userId}/roles/${roleId}`, {
      method: "DELETE",
    }),
};
