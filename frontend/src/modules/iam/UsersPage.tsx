import { useEffect, useState } from "react";
import { UserCheck, Shield } from "lucide-react";
import { api, DirectoryUser } from "../../api";
import { Badge } from "../../components/common/Badge";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";

export function UsersPage() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api.users();
      setUsers(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Directory Users</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            List of users with portal access, their credentials, and assigned roles.
          </p>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-danger-bg)",
            color: "var(--color-danger-fg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {!loading && users.length === 0 ? (
        <EmptyState
          icon={<UserCheck size={24} />}
          title="No users found"
          description="Directory users will appear here once provisioned for this tenant."
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Email Address</th>
                <th>Assigned Roles</th>
                <th style={{ width: "120px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow cols={4} rows={4} />
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 550 }}>{u.full_name}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        {u.roles && u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <Badge key={r} variant="info" size="sm">
                              <Shield size={12} style={{ marginRight: 2 }} />
                              {r}
                            </Badge>
                          ))
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                            No roles assigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge variant={u.is_active ? "success" : "neutral"}>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
