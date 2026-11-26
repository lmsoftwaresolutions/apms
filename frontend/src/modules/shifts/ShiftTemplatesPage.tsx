import { useEffect, useState } from "react";
import { CalendarRange, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, PolicySummary, ShiftTemplate } from "../../api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingRow } from "../../components/common/Spinner";
import { useAuth } from "../../context/AuthContext";
import { ShiftTemplateModal } from "./ShiftTemplateModal";
import {
  computeGapMinutes,
  computeSessionDurationMinutes,
  formatDuration,
  formatTimeShort,
  parseTimeToMinutes,
} from "./shiftUtils";

function formatTypeLabel(shiftType: string): string {
  const upper = shiftType.toUpperCase();
  if (upper === "FIXED") return "Fixed";
  if (upper === "OVERNIGHT") return "Overnight";
  if (upper === "SPLIT") return "Split";
  if (upper === "FLEXI") return "Flexi";
  if (upper === "CONTINUOUS") return "Continuous";
  return shiftType;
}

function CoverageBar24h({ template }: { template: ShiftTemplate }) {
  const sorted = [...template.sessions].sort((a, b) => a.session_order - b.session_order);
  const barColor =
    template.is_overnight || template.shift_type === "OVERNIGHT"
      ? "#6366f1"
      : template.color_code || "#2563eb";

  const segments: Array<{ leftPct: number; widthPct: number }> = [];
  for (const s of sorted) {
    const startMin = parseTimeToMinutes(s.start_time);
    const endMin = parseTimeToMinutes(s.end_time);
    if (endMin < startMin || s.is_overnight) {
      segments.push({
        leftPct: (startMin / 1440) * 100,
        widthPct: ((1440 - startMin) / 1440) * 100,
      });
      if (endMin > 0) {
        segments.push({
          leftPct: 0,
          widthPct: (endMin / 1440) * 100,
        });
      }
    } else if (endMin > startMin) {
      segments.push({
        leftPct: (startMin / 1440) * 100,
        widthPct: ((endMin - startMin) / 1440) * 100,
      });
    }
  }

  return (
    <div
      title="24-hour shift coverage (00:00 – 24:00)"
      style={{
        position: "relative",
        width: "100px",
        height: "6px",
        borderRadius: "999px",
        background: "var(--bg-active)",
        overflow: "hidden",
      }}
    >
      {segments.map((seg, idx) => (
        <div
          key={idx}
          style={{
            position: "absolute",
            left: `${seg.leftPct}%`,
            width: `${Math.max(3, seg.widthPct)}%`,
            top: 0,
            bottom: 0,
            borderRadius: "999px",
            background: barColor,
          }}
        />
      ))}
    </div>
  );
}

export function ShiftTemplatesPage() {
  const { can } = useAuth();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);

  // Deactivate / Delete Confirmations
  const [deactivateTarget, setDeactivateTarget] = useState<ShiftTemplate | null>(null);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShiftTemplate | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [templateList, policyList] = await Promise.all([
        api.shiftTemplates(false),
        api.policies().catch(() => [] as PolicySummary[]),
      ]);
      setTemplates(templateList);
      setPolicies(policyList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shift templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const policyMap = new Map(policies.map((p) => [p.id, p]));

  const totalCount = templates.length;
  const activeCount = templates.filter((t) => t.is_active).length;
  const overnightCount = templates.filter(
    (t) => t.is_overnight || t.shift_type === "OVERNIGHT",
  ).length;

  const filteredTemplates = templates.filter((tpl) => {
    if (statusFilter === "ACTIVE" && !tpl.is_active) return false;
    if (statusFilter === "INACTIVE" && tpl.is_active) return false;
    if (policyFilter !== "ALL" && (tpl.policy_id || "") !== policyFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!tpl.code.toLowerCase().includes(q) && !tpl.name.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  function openCreateModal() {
    setEditingTemplate(null);
    setIsModalOpen(true);
  }

  function openEditModal(tpl: ShiftTemplate) {
    setEditingTemplate(tpl);
    setIsModalOpen(true);
  }

  async function handleToggleActive(tpl: ShiftTemplate) {
    if (!can("shift.template.update")) return;
    if (tpl.is_active) {
      setDeactivateTarget(tpl);
      return;
    }
    try {
      await api.updateShiftTemplate(tpl.id, { is_active: true });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate shift template");
    }
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setDeactivateSubmitting(true);
    try {
      await api.updateShiftTemplate(deactivateTarget.id, { is_active: false });
      setDeactivateTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate shift template");
    } finally {
      setDeactivateSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await api.deleteShiftTemplate(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete shift template");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function getTimingParts(tpl: ShiftTemplate): { range: string; duration: string } {
    const sorted = [...tpl.sessions].sort((a, b) => a.session_order - b.session_order);
    if (sorted.length === 0) return { range: "—", duration: "" };
    let totalMins = 0;
    const parts = sorted.map((s) => {
      totalMins += computeSessionDurationMinutes(s.start_time, s.end_time);
      const start = formatTimeShort(s.start_time);
      const end = formatTimeShort(s.end_time);
      return `${start} – ${end}${s.is_overnight ? " +1d" : ""}`;
    });
    return {
      range: parts.join(" & "),
      duration: formatDuration(totalMins),
    };
  }

  function formatBreakOrGap(tpl: ShiftTemplate) {
    const sorted = [...tpl.sessions].sort((a, b) => a.session_order - b.session_order);
    if (sorted.length === 0) return "—";
    const totalBreak = sorted.reduce((acc, s) => acc + s.break_duration_minutes, 0);
    if (sorted.length > 1) {
      const gap = computeGapMinutes(sorted[0].end_time, sorted[1].start_time);
      const gapText = gap > 0 ? `${formatDuration(gap)} N65 Gap` : "Split";
      return totalBreak > 0 ? `${gapText} + ${totalBreak}m` : gapText;
    }
    return totalBreak > 0 ? `${totalBreak}m break` : "No break";
  }

  return (
    <div>
      {/* Header */}
      <div
        className="card-header"
        style={{
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2 className="card-title">Shift Templates</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Manage multi-session shift schedules, break intervals, N65 mid-shift gaps and linked attendance policies.
          </p>
        </div>
        <div>
          {can("shift.template.create") ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={openCreateModal}>
              Add shift template
            </Button>
          ) : null}
        </div>
      </div>

      {/* 3 Compact KPI Cards */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1.15rem",
        }}
      >
        <div
          className="card-panel"
          style={{ padding: "0.85rem 1.25rem", minWidth: "135px", marginBottom: 0 }}
        >
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {totalCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Total templates</div>
        </div>

        <div
          className="card-panel"
          style={{ padding: "0.85rem 1.25rem", minWidth: "135px", marginBottom: 0 }}
        >
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {activeCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Active</div>
        </div>

        <div
          className="card-panel"
          style={{ padding: "0.85rem 1.25rem", minWidth: "135px", marginBottom: 0 }}
        >
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {overnightCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Overnight</div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {/* Sleek Filter Bar */}
      <div
        style={{
          marginBottom: "0.875rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "340px" }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            placeholder="Search shift code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.2rem" }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="select"
            style={{ width: "auto", minWidth: "150px" }}
            value={policyFilter}
            onChange={(e) => setPolicyFilter(e.target.value)}
          >
            <option value="ALL">All policies</option>
            <option value="">Default only</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            style={{ width: "auto", minWidth: "135px" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* 8-Column Directory Table */}
      {loading ? (
        <div className="table-container">
          <table className="data-table">
            <tbody>
              <LoadingRow cols={8} />
            </tbody>
          </table>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={<CalendarRange size={36} />}
          title="No shift templates found"
          description={
            templates.length === 0
              ? "Create your first shift template (Standard, Split N65, or Overnight) to start scheduling."
              : "No shift templates match your current search or filters."
          }
          action={
            templates.length === 0 && can("shift.template.create")
              ? {
                  label: "Add shift template",
                  onClick: openCreateModal,
                  icon: <Plus size={16} />,
                }
              : undefined
          }
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Type</th>
                  <th>Timing</th>
                  <th>24h Coverage</th>
                  <th>Break / N65</th>
                  <th>Policy</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((tpl) => {
                  const linkedPolicy = tpl.policy_id ? policyMap.get(tpl.policy_id) : null;
                  const timing = getTimingParts(tpl);
                  const isOvernight = tpl.is_overnight || tpl.shift_type === "OVERNIGHT";

                  return (
                    <tr key={tpl.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                          {tpl.name}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.74rem",
                            color: "var(--text-muted)",
                            marginTop: "0.1rem",
                          }}
                        >
                          {tpl.code}
                        </div>
                      </td>
                      <td>
                        <Badge
                          variant={
                            tpl.shift_type === "SPLIT"
                              ? "warning"
                              : isOvernight
                                ? "info"
                                : "info"
                          }
                        >
                          {formatTypeLabel(tpl.shift_type)}
                        </Badge>
                      </td>
                      <td>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)" }}>
                          {timing.range}
                        </div>
                        {timing.duration ? (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                            {timing.duration}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <CoverageBar24h template={tpl} />
                      </td>
                      <td style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        {formatBreakOrGap(tpl)}
                      </td>
                      <td>
                        <Badge variant="neutral">
                          {linkedPolicy ? linkedPolicy.name : "Default"}
                        </Badge>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(tpl)}
                          disabled={!can("shift.template.update")}
                          title={tpl.is_active ? "Click to deactivate" : "Click to activate"}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: can("shift.template.update") ? "pointer" : "default",
                          }}
                        >
                          <span
                            style={{
                              position: "relative",
                              width: "34px",
                              height: "20px",
                              borderRadius: "999px",
                              background: tpl.is_active ? "var(--color-success)" : "var(--border-strong)",
                              transition: "background 0.15s ease",
                              display: "inline-block",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: "2px",
                                left: tpl.is_active ? "16px" : "2px",
                                width: "16px",
                                height: "16px",
                                borderRadius: "999px",
                                background: "#ffffff",
                                transition: "left 0.15s ease",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                              }}
                            />
                          </span>
                          <span
                            style={{
                              fontSize: "0.825rem",
                              fontWeight: 500,
                              color: tpl.is_active ? "var(--color-success-fg)" : "var(--text-muted)",
                            }}
                          >
                            {tpl.is_active ? "Active" : "Inactive"}
                          </span>
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.25rem" }}>
                          {can("shift.template.update") ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit shift template"
                              onClick={() => openEditModal(tpl)}
                            >
                              <Pencil size={15} />
                            </Button>
                          ) : null}
                          {can("shift.template.delete") ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete shift template"
                              onClick={() => setDeleteTarget(tpl)}
                            >
                              <Trash2 size={15} color="var(--color-danger)" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}

      {!loading && templates.length > 0 ? (
        <div style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          Showing {filteredTemplates.length} of {templates.length} templates
        </div>
      ) : null}

      {/* Add / Edit Modal */}
      <ShiftTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingTemplate={editingTemplate}
        policies={policies}
        onSaved={loadData}
      />

      {/* Deactivate Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Shift Template"
        message={`Are you sure you want to deactivate "${deactivateTarget?.name}" (${deactivateTarget?.code})? It will no longer be selectable for new roster assignments.`}
        confirmText="Deactivate"
        confirmVariant="danger"
        loading={deactivateSubmitting}
      />

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Shift Template"
        message={`Are you sure you want to permanently delete "${deleteTarget?.name}" (${deleteTarget?.code})? Templates already referenced by historical rosters cannot be deleted.`}
        confirmText="Delete Template"
        confirmVariant="danger"
        loading={deleteSubmitting}
      />
    </div>
  );
}
