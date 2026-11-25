import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, LogIn } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || "/";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        backgroundColor: "var(--bg-canvas)",
      }}
    >
      <div
        className="card-panel"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "2.5rem 2rem",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              backgroundColor: "var(--color-primary-bg)",
              color: "var(--color-primary)",
              border: "1px solid var(--color-primary-border)",
              display: "inline-grid",
              placeItems: "center",
              marginBottom: "1rem",
            }}
          >
            <ShieldCheck size={26} />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            APMS
          </h1>
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: 1.4,
            }}
          >
            Enterprise Attendance, Leave & Payroll Console
          </p>
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Field label="Email Address" required>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              required
            />
          </Field>

          <Field label="Password" required>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!email || password.length < 4}
            icon={<LogIn size={16} />}
            style={{ marginTop: "0.5rem", width: "100%", padding: "0.625rem 1rem" }}
          >
            Sign in
          </Button>
        </form>

        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          <ShieldCheck size={14} style={{ color: "var(--color-primary-fg)", flexShrink: 0 }} />
          <span>Protected by Row-Level Security & Role-Based Access Controls</span>
        </div>
      </div>
    </div>
  );
}
