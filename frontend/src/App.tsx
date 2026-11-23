import { FormEvent, useEffect, useState } from "react";
import { api, Branch, Department, Designation, DirectoryUser, EmployeeRow, loadToken, Me, Permission, Role, saveToken } from "./api";

function can(me: Me, code: string) {
  return me.permissions.includes(code);
}

export function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api.me().then(setMe).catch((err: Error) => {
      setError(err.message);
      saveToken(null);
      setToken(null);
    });
  }, [token]);

  if (!token || !me) {
    return <SignIn error={error} onSignedIn={(next) => { setError(""); setToken(next); }} />;
  }

  return <Console me={me} onSignOut={() => { saveToken(null); setToken(null); setMe(null); }} />;
}

function SignIn({ error, onSignedIn }: { error: string; onSignedIn: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setLocalError("");
    try {
      const result = await api.login(email, password);
      saveToken(result.access_token);
      onSignedIn(result.access_token);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="gate">
      <form className="card" onSubmit={submit}>
        <h1>APMS</h1>
        <p className="lede">Sign in to manage branches and who may change them.</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {(localError || error) && <p className="error">{localError || error}</p>}
        <button className="primary" type="submit" disabled={pending || password.length < 8}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function Console({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const initial = me.tenant.display_name.slice(0, 1).toUpperCase();
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          {me.tenant.logo_url ? <img className="mark" src={me.tenant.logo_url} alt="" /> : <span className="mark">{initial}</span>}
          <div>
            <h1>{me.tenant.display_name}</h1>
            <p className="who">{me.full_name}</p>
          </div>
        </div>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </header>
      <div className="layout">
        <Branches me={me} />
        {can(me, "org.department.read") ? <Departments me={me} /> : null}
        {can(me, "org.designation.read") ? <Designations me={me} /> : null}
        {can(me, "iam.role.read") ? <Roles me={me} /> : <p className="empty">Role administration is not on this account.</p>}
      </div>
    </div>
  );
}

function Branches({ me }: { me: Me }) {
  const [rows, setRows] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setRows(await api.branches());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load branches");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createBranch(name, code.toUpperCase());
      setName("");
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the branch");
    }
  }

  return (
    <section className="panel">
      <h2>Branches</h2>
      {loading ? <p>Loading branches…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && rows.length === 0 ? <p className="empty">No branches yet.</p> : null}
      {rows.length > 0 ? (
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.code}</td>
                <td>{branch.name}</td>
                <td>{branch.is_active ? "Active" : "Inactive"}</td>
                <td className="row">
                  {can(me, "org.branch.update") ? (
                    <button type="button" onClick={() => api.updateBranch(branch.id, { is_active: !branch.is_active }).then(refresh)}>
                      {branch.is_active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                  {can(me, "org.branch.delete") ? (
                    <button className="danger" type="button" onClick={() => api.deleteBranch(branch.id).then(refresh)}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {can(me, "org.branch.create") ? (
        <form className="stack" onSubmit={create}>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label>
          <button className="primary" type="submit" disabled={!name || code.length < 2}>Add branch</button>
        </form>
      ) : null}
    </section>
  );
}

function Departments({ me }: { me: Me }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh(targetBranchId?: string) {
    setLoading(true);
    try {
      const branchList = await api.branches();
      setBranches(branchList);
      const activeBranchId = targetBranchId ?? selectedBranchId ?? branchList[0]?.id ?? "";
      if (!selectedBranchId && branchList.length > 0) {
        setSelectedBranchId(branchList[0].id);
      }
      const deptList = await api.departments(activeBranchId || undefined);
      setDepartments(deptList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [selectedBranchId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!selectedBranchId) return;
    setError("");
    try {
      await api.createDepartment(selectedBranchId, name, code.toUpperCase(), parentId || null);
      setName("");
      setCode("");
      setParentId("");
      await refresh(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the department");
    }
  }

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const departmentById = new Map(departments.map((dept) => [dept.id, dept]));

  function parentLabel(parentDeptId: string | null | undefined) {
    if (!parentDeptId) return "—";
    const parent = departmentById.get(parentDeptId);
    return parent ? `${parent.name} (${parent.code})` : parentDeptId.slice(0, 8);
  }

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await refresh(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the department");
    }
  }

  return (
    <section className="panel">
      <h2>Departments</h2>
      <div className="stack">
        {branches.length > 0 ? (
          <label>
            Filter by Branch
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                void refresh(e.target.value);
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {loading ? <p>Loading departments…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && departments.length === 0 ? <p className="empty">No departments yet.</p> : null}
      {departments.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Branch</th>
              <th>Parent</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <tr key={dept.id}>
                <td>{dept.code}</td>
                <td>{dept.name}</td>
                <td>{branchNameById.get(dept.branch_id) || dept.branch_id.slice(0, 8)}</td>
                <td>{parentLabel(dept.parent_dept_id)}</td>
                <td>{dept.is_active ? "Active" : "Inactive"}</td>
                <td className="row">
                  {can(me, "org.department.update") ? (
                    <button type="button" onClick={() => run(() => api.updateDepartment(dept.id, { is_active: !dept.is_active }))}>
                      {dept.is_active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                  {can(me, "org.department.delete") ? (
                    <button className="danger" type="button" onClick={() => run(() => api.deleteDepartment(dept.id))}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {can(me, "org.department.create") ? (
        <form className="stack" onSubmit={create}>
          <label>
            Branch
            <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </label>
          <label>
            Parent
            <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">None</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} ({dept.code})
                </option>
              ))}
            </select>
          </label>
          <button className="primary" type="submit" disabled={!name || code.length < 2 || !selectedBranchId}>
            Add department
          </button>
        </form>
      ) : null}
    </section>
  );
}

function Designations({ me }: { me: Me }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh(targetBranchId?: string, targetDeptId?: string) {
    setLoading(true);
    try {
      const branchList = await api.branches();
      setBranches(branchList);
      const activeBranchId = targetBranchId ?? selectedBranchId ?? branchList[0]?.id ?? "";
      if (!selectedBranchId && branchList.length > 0) {
        setSelectedBranchId(branchList[0].id);
      }
      const deptList = await api.departments(activeBranchId || undefined);
      setDepartments(deptList);
      const activeDeptId =
        targetDeptId !== undefined
          ? targetDeptId
          : selectedDeptId && deptList.some((d) => d.id === selectedDeptId)
            ? selectedDeptId
            : deptList[0]?.id ?? "";
      setSelectedDeptId(activeDeptId);

      if (activeDeptId) {
        const desigList = await api.designations(activeDeptId);
        setDesignations(desigList);
        if (can(me, "employee.employee.read")) {
          setEmployees(await api.employees(activeDeptId));
        } else {
          setEmployees([]);
        }
      } else {
        setDesignations([]);
        setEmployees([]);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load designations");
    } finally {
      setLoading(false);
    }
  }

  // Initial load only — selection changes are driven by explicit refresh() calls
  // in the onChange handlers, so we exclude selectedBranchId/selectedDeptId from deps
  // to avoid a double-fetch loop.
  useEffect(() => {
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!selectedDeptId) return;
    setError("");
    try {
      await api.createDesignation(selectedDeptId, name, code.toUpperCase(), description || null);
      setName("");
      setCode("");
      setDescription("");
      await refresh(selectedBranchId, selectedDeptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create designation");
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await refresh(selectedBranchId, selectedDeptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update designation");
    }
  }

  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <section className="panel">
      <h2>Designations</h2>
      <div className="stack">
        {branches.length > 0 ? (
          <label>
            Filter by Branch
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                void refresh(e.target.value, "");
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {departments.length > 0 ? (
          <label>
            Department
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                void refresh(selectedBranchId, e.target.value);
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="empty">No departments found for the selected branch. Create a department first.</p>
        )}
      </div>
      {loading ? <p>Loading designations…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && selectedDeptId && designations.length === 0 ? (
        <p className="empty">No designations in this department yet.</p>
      ) : null}
      {designations.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Department</th>
              <th>Description</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {designations.map((desig) => (
              <tr key={desig.id}>
                <td>{desig.code}</td>
                <td>{desig.name}</td>
                <td>{deptNameById.get(desig.department_id) || desig.department_id.slice(0, 8)}</td>
                <td>{desig.description || "—"}</td>
                <td>{desig.is_active ? "Active" : "Inactive"}</td>
                <td className="row">
                  {can(me, "org.designation.update") ? (
                    <button
                      type="button"
                      onClick={() => run(() => api.updateDesignation(desig.id, { is_active: !desig.is_active }))}
                    >
                      {desig.is_active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                  {can(me, "org.designation.delete") ? (
                    <button className="danger" type="button" onClick={() => run(() => api.deleteDesignation(desig.id))}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {can(me, "org.designation.create") && selectedDeptId ? (
        <form className="stack" onSubmit={create}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Spinning Operator" />
          </label>
          <label>
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="e.g. OPR-SPIN"
            />
          </label>
          <label>
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
            />
          </label>
          <button className="primary" type="submit" disabled={!name || code.length < 2 || !selectedDeptId}>
            Add designation
          </button>
        </form>
      ) : null}
      {can(me, "employee.employee.update") && employees.length > 0 ? (
        <div className="stack">
          <h3>Assign to employees</h3>
          {employees.map((employee) => (
            <label key={employee.id}>
              {employee.full_name} ({employee.employee_code})
              <select
                value={employee.designation_id ?? ""}
                onChange={(event) =>
                  run(() => api.assignDesignation(employee.id, event.target.value || null))
                }
              >
                <option value="">None</option>
                {designations
                  .filter((desig) => desig.is_active || desig.id === employee.designation_id)
                  .map((desig) => (
                    <option key={desig.id} value={desig.id}>
                      {desig.name} ({desig.code})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Roles({ me }: { me: Me }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.roles(), api.permissions(), api.users().catch(() => [])])
      .then(([nextRoles, nextCatalog, nextUsers]) => {
        setRoles(nextRoles);
        setCatalog(nextCatalog);
        setUsers(nextUsers);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function toggle(role: Role, code: string) {
    const permissions = role.permissions.includes(code)
      ? role.permissions.filter((item) => item !== code)
      : [...role.permissions, code];
    try {
      const updated = await api.updateRole(role.id, permissions);
      setRoles((current) => current.map((item) => (item.id === role.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the role");
    }
  }

  return (
    <section className="panel">
      <h2>Roles</h2>
      {error ? <p className="error">{error}</p> : null}
      {roles.map((role) => (
        <article key={role.id} className="stack">
          <h3>{role.name}</h3>
          <div className="checks">
            {catalog.map((permission) => (
              <label key={permission.code}>
                <input
                  type="checkbox"
                  checked={role.permissions.includes(permission.code)}
                  disabled={!can(me, "iam.role.update")}
                  onChange={() => toggle(role, permission.code)}
                />
                {permission.code}
              </label>
            ))}
          </div>
        </article>
      ))}
      {users.length > 0 ? (
        <ul>
          {users.map((user) => (
            <li key={user.id}>{user.full_name} · {user.roles.join(", ") || "no role"}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
