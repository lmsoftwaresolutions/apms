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
  return response.json() as Promise<T>;
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
};
