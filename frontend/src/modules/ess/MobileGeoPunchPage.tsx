import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  RefreshCw,
  LogIn,
  LogOut,
  Wifi,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { LoadingRow } from "../../components/common/Spinner";

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function MobileGeoPunchPage() {
  const [context, setContext] = useState<Awaited<ReturnType<typeof api.essMobilePunchContext>> | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState("");

  // GPS State
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [distanceM, setDistanceM] = useState<number | null>(null);

  // Punch Action State
  const [submittingPunch, setSubmittingPunch] = useState<"IN" | "OUT" | null>(null);
  const [actionSuccess, setActionSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  async function loadContext() {
    setLoadingContext(true);
    setContextError("");
    try {
      const data = await api.essMobilePunchContext();
      setContext(data);
    } catch (err) {
      setContextError(err instanceof Error ? err.message : "Failed to load mobile punch context");
    } finally {
      setLoadingContext(false);
    }
  }

  function acquireLocation() {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser or device.");
      return;
    }
    setGpsLoading(true);
    setGpsError("");
    setActionError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const userCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setCoords(userCoords);

        if (context?.branch?.geofence_latitude != null && context?.branch?.geofence_longitude != null) {
          const d = haversineDistanceM(
            userCoords.latitude,
            userCoords.longitude,
            context.branch.geofence_latitude,
            context.branch.geofence_longitude
          );
          setDistanceM(d);
        } else {
          setDistanceM(null);
        }
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(`GPS error (${err.code}): ${err.message}. Please enable location permissions.`);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  useEffect(() => {
    void loadContext();
  }, []);

  // When context finishes loading, automatically acquire GPS
  useEffect(() => {
    if (context) {
      acquireLocation();
    }
  }, [context?.branch?.id]);

  const branch = context?.branch;
  const radius = branch?.geofence_radius_m || 150;
  const isInside = distanceM !== null && distanceM <= radius;

  async function handlePunch(direction: "IN" | "OUT") {
    if (!coords) {
      setActionError("GPS coordinates required. Please click 'Refresh GPS' first.");
      return;
    }

    setSubmittingPunch(direction);
    setActionSuccess("");
    setActionError("");

    try {
      const res = await api.essMobilePunch({
        punch_direction: direction,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_m: coords.accuracy,
      });

      const timeFormatted = new Date(res.punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const verifiedText = res.geofence_verified ? "within verified geofence" : "outside boundary zone";
      setActionSuccess(`Punch ${direction} recorded successfully at ${timeFormatted} (${verifiedText}).`);

      // Refresh today's punches
      await loadContext();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to record Punch ${direction}`);
    } finally {
      setSubmittingPunch(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.25rem", maxWidth: "900px", margin: "0 auto" }}>
      {/* Top Bar Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <Link
          to="/ess"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            color: "var(--color-primary)",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          <ArrowLeft size={16} /> Back to ESS Portal
        </Link>
        <Button variant="secondary" size="sm" onClick={acquireLocation} disabled={gpsLoading}>
          <RefreshCw size={14} className={gpsLoading ? "animate-spin" : ""} style={{ marginRight: "0.35rem" }} />
          {gpsLoading ? "Refreshing..." : "Refresh GPS"}
        </Button>
      </div>

      {/* Header Banner */}
      <div className="card-panel" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 className="card-title" style={{ fontSize: "1.35rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <MapPin size={22} style={{ color: "var(--color-primary)" }} />
              Mobile Geofence Punch (M19)
            </h1>
            <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              One-tap verified biometric punch capture using high-accuracy device geolocation.
            </p>
          </div>
          {context && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 600 }}>{context.full_name}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Code: <code>{context.employee_code}</code></div>
            </div>
          )}
        </div>
      </div>

      {contextError && (
        <div className="card-panel" style={{ borderLeft: "4px solid var(--color-danger)", background: "var(--bg-subtle)", padding: "0.75rem 1rem", color: "var(--color-danger)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertTriangle size={18} />
          <span>{contextError}</span>
        </div>
      )}

      {actionError && (
        <div className="card-panel" style={{ borderLeft: "4px solid var(--color-danger)", background: "var(--bg-subtle)", padding: "0.75rem 1rem", color: "var(--color-danger)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertTriangle size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="card-panel" style={{ borderLeft: "4px solid var(--color-success)", background: "var(--bg-subtle)", padding: "0.75rem 1rem", color: "var(--color-success)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Geofence Status Card */}
      <div className="card-panel" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Navigation size={18} style={{ color: "var(--color-primary)" }} />
          Geofence Boundary Status
        </h2>

        {branch ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <div style={{ padding: "0.75rem", background: "var(--bg-subtle)", borderRadius: "6px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Assigned Branch</div>
              <div style={{ fontWeight: 600, marginTop: "0.25rem" }}>{branch.name} ({branch.code})</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Allowed Radius: <strong>{radius}m</strong>
              </div>
            </div>

            <div style={{ padding: "0.75rem", background: "var(--bg-subtle)", borderRadius: "6px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Your Device GPS</div>
              {coords ? (
                <>
                  <div style={{ fontWeight: 600, marginTop: "0.25rem" }}>
                    {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                    Accuracy: ±{coords.accuracy}m
                  </div>
                </>
              ) : gpsLoading ? (
                <div style={{ marginTop: "0.25rem", color: "var(--text-muted)" }}>Acquiring location...</div>
              ) : (
                <div style={{ marginTop: "0.25rem", color: "var(--color-danger)" }}>Location unavailable</div>
              )}
            </div>

            <div style={{ padding: "0.75rem", background: "var(--bg-subtle)", borderRadius: "6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Validation Status</div>
              <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {distanceM !== null ? (
                  <>
                    <Badge variant={isInside ? "success" : "danger"}>
                      {isInside ? "WITHIN GEOFENCE ✓" : "OUTSIDE ZONE ⚠️"}
                    </Badge>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{distanceM}m away</span>
                  </>
                ) : branch.geofence_latitude == null ? (
                  <Badge variant="warning">No Branch Coords Set</Badge>
                ) : (
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Calculating...</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "1rem", color: "var(--text-muted)", textAlign: "center" }}>
            No branch assigned to your employee record. Contact HR to link an office branch.
          </div>
        )}

        {gpsError && (
          <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-surface)", color: "var(--color-danger)", borderRadius: "4px", fontSize: "0.85rem" }}>
            {gpsError}
          </div>
        )}
      </div>

      {/* One-Tap Punch Action Buttons */}
      <div className="card-panel" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Clock size={18} style={{ color: "var(--color-primary)" }} />
          Record Attendance Punch
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handlePunch("IN")}
            disabled={submittingPunch !== null || gpsLoading || !coords}
            style={{
              padding: "1.25rem 1rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "0.5rem",
              background: "#16a34a",
              borderColor: "#16a34a",
            }}
          >
            <LogIn size={22} />
            {submittingPunch === "IN" ? "Recording IN..." : "PUNCH IN"}
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={() => void handlePunch("OUT")}
            disabled={submittingPunch !== null || gpsLoading || !coords}
            style={{
              padding: "1.25rem 1rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "0.5rem",
              background: "#dc2626",
              color: "#fff",
              borderColor: "#dc2626",
            }}
          >
            <LogOut size={22} />
            {submittingPunch === "OUT" ? "Recording OUT..." : "PUNCH OUT"}
          </Button>
        </div>
      </div>

      {/* Today's Punches Feed Table */}
      <div className="card-panel" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShieldCheck size={18} style={{ color: "var(--color-primary)" }} />
          Today's Recorded Punches
        </h2>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "110px" }}>Time</th>
                <th style={{ width: "90px" }}>Direction</th>
                <th style={{ width: "110px" }}>Source</th>
                <th>Distance / Accuracy</th>
                <th style={{ width: "120px" }}>Geofence</th>
                <th style={{ width: "100px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingContext ? (
                <LoadingRow cols={6} />
              ) : !context?.today_punches || context.today_punches.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)" }}>
                    No punches recorded yet today. Tap Punch IN above to start your shift.
                  </td>
                </tr>
              ) : (
                context.today_punches.map((p) => {
                  const meta = p.location_meta as { distance_m?: number; accuracy_m?: number; geofence_verified?: boolean } | undefined;
                  const punchDt = new Date(p.punch_time);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>
                        {punchDt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td>
                        <Badge variant={p.punch_direction === "IN" ? "success" : "neutral"}>
                          {p.punch_direction}
                        </Badge>
                      </td>
                      <td><code>{p.source}</code></td>
                      <td>
                        {meta?.distance_m != null ? (
                          <span>{meta.distance_m}m away (±{meta.accuracy_m || "?"}m)</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {meta?.geofence_verified ? (
                          <Badge variant="success">VERIFIED ✓</Badge>
                        ) : meta?.distance_m != null ? (
                          <Badge variant="danger">OUTSIDE ZONE</Badge>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>N/A</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={p.status === "ACTIVE" ? "success" : "neutral"}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
