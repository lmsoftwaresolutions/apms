import { FormEvent, useEffect, useState } from "react";
import { api, Branch, DirectoryUser, loadToken, Me, Permission, Role, saveToken } from "./api";

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
