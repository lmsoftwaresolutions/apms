import { FormEvent, useEffect, useState } from "react";
import { MapPin, Navigation, Wifi, Save, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { api, Branch } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Field } from "../../components/common/Field";
import { LoadingRow } from "../../components/common/Spinner";

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function BranchGeofencePage() {
  const { can } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [radiusM, setRadiusM] = useState<string>("150");
  const [bssids, setBssids] = useState<string>("");
  const [submitting, setFormSubmitting] = useState(false);

  // Browser Geolocation Tester State
  const [testingLoc, setTestingLoc] = useState(false);
  const [browserCoords, setBrowserCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [testError, setTestError] = useState("");
  const [testDistance, setTestDistance] = useState<number | null>(null);

  async function loadBranches() {
    setLoading(true);
    try {
      const data = await api.branches();
      setBranches(data);
      if (data.length > 0 && !selectedBranchId) {
        selectBranch(data[0]);
      } else if (selectedBranchId) {
        const current = data.find((b) => b.id === selectedBranchId);
        if (current) selectBranch(current);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }

  function selectBranch(b: Branch) {
    setSelectedBranchId(b.id);
    setLat(b.geofence_latitude != null ? String(b.geofence_latitude) : "");
    setLon(b.geofence_longitude != null ? String(b.geofence_longitude) : "");
    setRadiusM(b.geofence_radius_m != null ? String(b.geofence_radius_m) : "150");
    setBssids(b.allowed_bssids && b.allowed_bssids.length > 0 ? b.allowed_bssids.join(", ") : "");
    setSuccessMsg("");
    setTestDistance(null);
  }

  useEffect(() => {
    void loadBranches();
  }, []);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  async function handleSaveGeofence(e: FormEvent) {
    e.preventDefault();
    if (!selectedBranchId) return;

    setFormSubmitting(true);
    setError("");
    setSuccessMsg("");

    const parsedLat = lat.trim() ? parseFloat(lat.trim()) : null;
    const parsedLon = lon.trim() ? parseFloat(lon.trim()) : null;
    const parsedRadius = radiusM.trim() ? parseInt(radiusM.trim(), 10) : 150;
    const parsedBssids = bssids
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await api.updateBranch(selectedBranchId, {
        geofence_latitude: parsedLat,
        geofence_longitude: parsedLon,
        geofence_radius_m: parsedRadius,
        allowed_bssids: parsedBssids.length > 0 ? parsedBssids : null,
      });
      setSuccessMsg("Geofence boundary and allowed BSSIDs saved successfully.");
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save geofence configuration");
    } finally {
      setFormSubmitting(false);
    }
  }

  function testCurrentLocation() {
    if (!navigator.geolocation) {
      setTestError("Geolocation is not supported by this browser.");
      return;
    }
    setTestingLoc(true);
    setTestError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTestingLoc(false);
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setBrowserCoords(coords);

        const targetLat = lat.trim() ? parseFloat(lat.trim()) : selectedBranch?.geofence_latitude;
        const targetLon = lon.trim() ? parseFloat(lon.trim()) : selectedBranch?.geofence_longitude;

        if (targetLat != null && targetLon != null && !isNaN(targetLat) && !isNaN(targetLon)) {
          const d = haversineDistanceM(coords.latitude, coords.longitude, targetLat, targetLon);
          setTestDistance(d);
        } else {
          setTestDistance(null);
        }
      },
      (err) => {
        setTestingLoc(false);
        setTestError(`Location access error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  const effectiveRadius = parseInt(radiusM, 10) || selectedBranch?.geofence_radius_m || 150;
  const isInside = testDistance !== null && testDistance <= effectiveRadius;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.5rem" }}>
      {/* Page Header */}
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="card-title" style={{ fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <MapPin size={24} style={{ color: "var(--color-primary)" }} />
            Branch Geofence Registry (M19)
          </h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Configure geographic validation boundaries and allowed Wi-Fi BSSIDs for mobile punch capture.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => void loadBranches()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ marginRight: "0.35rem" }} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="card-panel" style={{ borderLeft: "4px solid var(--color-danger)", background: "var(--bg-subtle)", padding: "0.75rem 1rem", color: "var(--color-danger)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="card-panel" style={{ borderLeft: "4px solid var(--color-success)", background: "var(--bg-subtle)", padding: "0.75rem 1rem", color: "var(--color-success)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Configuration Card */}
      <div className="card-panel" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Navigation size={18} style={{ color: "var(--color-primary)" }} />
          Geofence Coordinates & Policy
        </h2>

        <form onSubmit={(e) => void handleSaveGeofence(e)} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Branch Selector (Hidden / Compact if single branch) */}
          {branches.length > 1 ? (
            <Field label="Target Branch *">
              <select
                className="input"
                value={selectedBranchId}
                onChange={(e) => {
                  const b = branches.find((item) => item.id === e.target.value);
                  if (b) selectBranch(b);
                }}
                style={{ width: "100%", maxWidth: "400px" }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}) {b.geofence_latitude ? "✓ Configured" : "— Not Configured"}
                  </option>
                ))}
              </select>
            </Field>
          ) : selectedBranch ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem" }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Branch:</span>
              <Badge variant="neutral">{selectedBranch.name} ({selectedBranch.code})</Badge>
              {selectedBranch.registration_number && (
                <span style={{ color: "var(--text-muted)" }}>Reg: {selectedBranch.registration_number}</span>
              )}
            </div>
          ) : null}

          {/* Coordinate Fields Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <Field label="Latitude *" help="e.g. 18.520430 (Decimal degrees, -90 to +90)">
              <input
                type="number"
                step="0.000001"
                className="input"
                placeholder="18.520430"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                required
              />
            </Field>
            <Field label="Longitude *" help="e.g. 73.856744 (Decimal degrees, -180 to +180)">
              <input
                type="number"
                step="0.000001"
                className="input"
                placeholder="73.856744"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                required
              />
            </Field>
            <Field label="Allowed Radius (Meters) *" help="Distance threshold (default: 150m)">
              <input
                type="number"
                min="10"
                max="50000"
                className="input"
                placeholder="150"
                value={radiusM}
                onChange={(e) => setRadiusM(e.target.value)}
                required
              />
            </Field>
          </div>

          {/* Allowed Wi-Fi BSSIDs */}
          <Field
            label="Allowed Wi-Fi BSSIDs (Secondary Validation)"
            help="Comma or newline-separated MAC addresses (e.g. D4:20:B0:11:22:33, AA:BB:CC:DD:EE:FF). Punches connected to these access points will verify even if GPS is degraded."
          >
            <textarea
              className="input"
              rows={2}
              placeholder="00:11:22:33:44:55, AA:BB:CC:DD:EE:FF"
              value={bssids}
              onChange={(e) => setBssids(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </Field>

          {/* Action Row */}
          {can("org.branch.update") && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <Button type="submit" variant="primary" disabled={submitting}>
                <Save size={16} style={{ marginRight: "0.35rem" }} />
                {submitting ? "Saving Coordinates..." : "Save Geofence Settings"}
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Interactive Boundary Preview & GPS Tester */}
      <div className="card-panel" style={{ padding: "1.25rem", background: "var(--bg-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={18} style={{ color: "var(--color-success)" }} />
            Live Boundary Tester
          </h2>
          <Button variant="secondary" size="sm" onClick={testCurrentLocation} disabled={testingLoc}>
            <Navigation size={14} className={testingLoc ? "animate-spin" : ""} style={{ marginRight: "0.35rem" }} />
            {testingLoc ? "Acquiring GPS..." : "Test My Current Browser Location"}
          </Button>
        </div>

        <p style={{ margin: "0 0 1rem 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Simulate a mobile worker punch from this device to verify the boundary calculation against the configured coordinates.
        </p>

        {testError && (
          <div style={{ padding: "0.5rem 0.75rem", background: "var(--bg-surface)", color: "var(--color-danger)", borderRadius: "4px", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
            {testError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          <div style={{ padding: "0.75rem", background: "var(--bg-surface)", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Branch Boundary Center</div>
            <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
              {lat && lon ? `${parseFloat(lat).toFixed(6)}, ${parseFloat(lon).toFixed(6)}` : "Not Configured"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Allowed Radius: <strong>{effectiveRadius} meters</strong>
            </div>
          </div>

          <div style={{ padding: "0.75rem", background: "var(--bg-surface)", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Your Device GPS</div>
            <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
              {browserCoords ? `${browserCoords.latitude.toFixed(6)}, ${browserCoords.longitude.toFixed(6)}` : "Click 'Test My Location'"}
            </div>
            {browserCoords && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Accuracy: ±{browserCoords.accuracy}m
              </div>
            )}
          </div>

          <div style={{ padding: "0.75rem", background: "var(--bg-surface)", borderRadius: "6px", border: "1px solid var(--border-default)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Validation Result</div>
            <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {testDistance !== null ? (
                <>
                  <Badge variant={isInside ? "success" : "danger"}>
                    {isInside ? "WITHIN GEOFENCE ✓" : "OUTSIDE ZONE ⚠️"}
                  </Badge>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {testDistance}m away
                  </span>
                </>
              ) : (
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Awaiting GPS sample</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Branches Geofence Directory Table */}
      <div className="card-panel" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Wifi size={18} style={{ color: "var(--color-primary)" }} />
          All Branch Geofence Registries
        </h2>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "160px" }}>Branch</th>
                <th style={{ width: "90px" }}>Code</th>
                <th>Coordinates (Lat, Lon)</th>
                <th style={{ width: "110px" }}>Radius</th>
                <th style={{ width: "120px" }}>Wi-Fi BSSIDs</th>
                <th style={{ width: "130px" }}>Geofence Status</th>
                <th style={{ width: "100px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow cols={7} />
              ) : branches.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                    No branches found for this tenant.
                  </td>
                </tr>
              ) : (
                branches.map((b) => {
                  const hasGeo = b.geofence_latitude != null && b.geofence_longitude != null;
                  const isCurrent = b.id === selectedBranchId;
                  return (
                    <tr key={b.id} style={{ background: isCurrent ? "var(--bg-active)" : undefined }}>
                      <td style={{ fontWeight: 600 }}>{b.name}</td>
                      <td><code>{b.code}</code></td>
                      <td>
                        {hasGeo ? (
                          <span>{b.geofence_latitude?.toFixed(5)}, {b.geofence_longitude?.toFixed(5)}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>— Not set —</span>
                        )}
                      </td>
                      <td>{b.geofence_radius_m ? `${b.geofence_radius_m}m` : "—"}</td>
                      <td>
                        {b.allowed_bssids && b.allowed_bssids.length > 0 ? (
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {b.allowed_bssids.length} allowed
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>None</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={hasGeo ? "success" : "neutral"}>
                          {hasGeo ? "CONFIGURED" : "PENDING"}
                        </Badge>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          variant={isCurrent ? "primary" : "secondary"}
                          size="sm"
                          onClick={() => selectBranch(b)}
                        >
                          {isCurrent ? "Editing" : "Configure"}
                        </Button>
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
