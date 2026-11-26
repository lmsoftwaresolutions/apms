import { useEffect, useState } from "react";
import { CalendarRange, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
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
} from "./shiftUtils";

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

  function formatTimingSummary(tpl: ShiftTemplate) {
    const sorted = [...tpl.sessions].sort((a, b) => a.session_order - b.session_order);
    if (sorted.length === 0) return "—";
    let totalMins = 0;
    const parts = sorted.map((s) => {
      totalMins += computeSessionDurationMinutes(s.start_time, s.end_time);
      const start = formatTimeShort(s.start_time);
      const end = formatTimeShort(s.end_time);
      return `${start} – ${end}${s.is_overnight ? " (+1d)" : ""}`;
    });
    return `${parts.join(" & ")} (${formatDuration(totalMins)})`;
  }

  function formatBreakOrGap(tpl: ShiftTemplate) {
    const sorted = [...tpl.sessions].sort((a, b) => a.session_order - b.session_order);
    if (sorted.length === 0) return "—";
    const totalBreak = sorted.reduce((acc, s) => acc + s.break_duration_minutes, 0);
    if (sorted.length > 1) {
      const gap = computeGapMinutes(sorted[0].end_time, sorted[1].start_time);
      const gapText = gap > 0 ? `${formatDuration(gap)} N65 Gap` : "Split";
      return totalBreak > 0 ? `${gapText} + ${totalBreak}m break` : gapText;
    }
    return totalBreak > 0 ? `${totalBreak}m break` : "No break";
  }

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Shift Templates</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Manage multi-session shift schedules, break intervals, N65 mid-shift gaps, and linked attendance policies.
          </p>
        </div>
        <div>
          {can("shift.template.create") ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={openCreateModal}>
              Add Shift Template
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {/* Filter Bar */}
      <div
        className="card"
        style={{
          padding: "0.875rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "360px" }}>
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            placeholder="Search shift code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="select"
            style={{ width: "auto", minWidth: "180px" }}
            value={policyFilter}
            onChange={(e) => setPolicyFilter(e.target.value)}
          >
            <option value="ALL">All Policies</option>
            <option value="">Tenant Default Only</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            style={{ width: "auto", minWidth: "140px" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <table className="table">
            <tbody>
              <LoadingRow cols={7} />
            </tbody>
          </table>
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
                    label: "Add Shift Template",
                    onClick: openCreateModal,
                    icon: <Plus size={16} />,
                  }
                : undefined
            }
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Shift Name</th>
                  <th>Type</th>
                  <th>Timing &amp; Break / N65 Gap</th>
                  <th>Linked Policy</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((tpl) => {
                  const linkedPolicy = tpl.policy_id ? policyMap.get(tpl.policy_id) : null;
                  return (
                    <tr key={tpl.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "999px",
                              background: tpl.color_code || "#3b82f6",
                              flexShrink: 0,
                            }}
                          />
                          <code style={{ fontWeight: 600 }}>{tpl.code}</code>
                        </div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{tpl.name}</td>
                      <td>
                        <Badge variant={tpl.shift_type === "SPLIT" ? "warning" : tpl.is_overnight ? "info" : "neutral"}>
                          {tpl.shift_type}
                        </Badge>
                      </td>
                      <td>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                          {formatTimingSummary(tpl)}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          {formatBreakOrGap(tpl)}
                        </div>
                      </td>
                      <td>
                        {linkedPolicy ? (
                          <span>{linkedPolicy.name}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Default</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={tpl.is_active ? "success" : "neutral"}>
                          {tpl.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                          {can("shift.template.update") ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Edit shift template"
                                onClick={() => openEditModal(tpl)}
                              >
                                <Pencil size={15} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title={tpl.is_active ? "Deactivate" : "Activate"}
                                onClick={() => void handleToggleActive(tpl)}
                              >
                                <Power size={15} color={tpl.is_active ? "var(--color-warning)" : "var(--color-success)"} />
                              </Button>
                            </>
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
      </div>

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
