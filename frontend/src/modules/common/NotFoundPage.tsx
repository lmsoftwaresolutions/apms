import { useNavigate, useLocation } from "react-router-dom";
import { Compass, Home, ArrowLeft } from "lucide-react";
import { Button } from "../../components/common/Button";

export function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "65vh",
        textAlign: "center",
        padding: "2rem 1rem",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          color: "#ef4444",
          display: "grid",
          placeItems: "center",
          marginBottom: "1.5rem",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        }}
      >
        <Compass size={36} />
      </div>

      <div
        style={{
          fontSize: "0.8125rem",
          fontWeight: 700,
          color: "#ef4444",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "0.5rem",
        }}
      >
        404 — Page Not Found
      </div>

      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 750,
          color: "var(--text-primary)",
          margin: "0 0 0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        Lost in the system?
      </h1>

      <p
        style={{
          fontSize: "0.9375rem",
          color: "var(--text-muted)",
          maxWidth: "460px",
          margin: "0 0 1.25rem",
          lineHeight: 1.5,
        }}
      >
        The address <code style={{ color: "var(--color-primary-fg)", backgroundColor: "var(--bg-card)", padding: "0.15rem 0.4rem", borderRadius: "0.25rem" }}>{location.pathname}</code> does not match any route in this portal.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <Button
          variant="secondary"
          onClick={() => navigate(-1)}
          icon={<ArrowLeft size={16} />}
        >
          Go Back
        </Button>
        <Button
          variant="primary"
          onClick={() => navigate("/org/departments")}
          icon={<Home size={16} />}
          style={{ backgroundColor: "#10b981", borderColor: "#10b981", color: "#ffffff" }}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
