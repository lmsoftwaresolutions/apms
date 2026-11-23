import React, { useEffect, useState } from "react";
import { Plus, Clock, Trash2, Edit } from "lucide-react";
import { api, ShiftTemplate, ShiftTemplateCreateInput, ShiftSession } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Badge, Drawer, EmptyState } from "../../components/common/UIComponents";

const PRESET_COLORS = [
  "#0f766e", // Teal
  "#1d4ed8", // Blue
  "#7c3aed", // Violet
  "#c026d3", // Fuchsia
  "#e11d48", // Rose
  "#d97706", // Amber
  "#059669", // Emerald
  "#475569", // Slate
];

export function ShiftsPage() {
  const { can } = useAuth();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shiftType, setShiftType] = useState("FIXED");
  const [colorCode, setColorCode] = useState("#0f766e");
  const [sessions, setSessions] = useState<ShiftSession[]>([
    {
      session_order: 1,
      name: "General Session",
      start_time: "09:00",
      end_time: "18:00",
      pre_window_minutes: 60,
      post_window_minutes: 120,
      grace_period_late_minutes: 15,
      grace_period_early_minutes: 15,
      min_presence_ratio: 0.5,
      break_duration_minutes: 60,
    },
  ]);
  const [saving, setSaving] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    setError("");
    try {
      const list = await api.shiftTemplates();
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shift templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  const openCreate = () => {
    setEditingTemplate(null);
    setCode("");
    setName("");
    setShiftType("FIXED");
    setColorCode("#0f766e");
    setSessions([
      {
        session_order: 1,
        name: "Morning Session",
        start_time: "09:00",
        end_time: "18:00",
        pre_window_minutes: 60,
        post_window_minutes: 120,
        grace_period_late_minutes: 15,
        grace_period_early_minutes: 15,
        min_presence_ratio: 0.5,
        break_duration_minutes: 60,
      },
    ]);
    setIsDrawerOpen(true);
  };

  const openEdit = (tpl: ShiftTemplate) => {
    setEditingTemplate(tpl);
    setCode(tpl.code);
    setName(tpl.name);
    setShiftType(tpl.shift_type);
    setColorCode(tpl.color_code || "#0f766e");
    setSessions(
      tpl.sessions?.length > 0
        ? tpl.sessions.map((s) => ({
            session_order: s.session_order,
            name: s.name,
            start_time: s.start_time.slice(0, 5),
            end_time: s.end_time.slice(0, 5),
            pre_window_minutes: s.pre_window_minutes,
            post_window_minutes: s.post_window_minutes,
            grace_period_late_minutes: s.grace_period_late_minutes,
            grace_period_early_minutes: s.grace_period_early_minutes,
            min_presence_ratio: s.min_presence_ratio,
            break_duration_minutes: s.break_duration_minutes,
          }))
        : [
            {
              session_order: 1,
              name: "General Session",
              start_time: "09:00",
              end_time: "18:00",
              pre_window_minutes: 60,
              post_window_minutes: 120,
              grace_period_late_minutes: 15,
              grace_period_early_minutes: 15,
              min_presence_ratio: 0.5,
              break_duration_minutes: 60,
            },
          ]
    );
    setIsDrawerOpen(true);
  };

  const addSession = () => {
    setSessions([
      ...sessions,
      {
        session_order: sessions.length + 1,
        name: `Session ${sessions.length + 1}`,
        start_time: "14:00",
        end_time: "18:00",
        pre_window_minutes: 30,
        post_window_minutes: 60,
        grace_period_late_minutes: 10,
        grace_period_early_minutes: 10,
        min_presence_ratio: 0.5,
        break_duration_minutes: 0,
      },
    ]);
  };

  const removeSession = (index: number) => {
    if (sessions.length <= 1) return;
    const next = sessions.filter((_, i) => i !== index).map((s, i) => ({ ...s, session_order: i + 1 }));
    setSessions(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: ShiftTemplateCreateInput = {
        code: code.toUpperCase(),
        name,
        shift_type: shiftType,
        color_code: colorCode,
        sessions: sessions.map((s) => ({
          ...s,
          start_time: s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time,
          end_time: s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time,
        })),
      };

      if (editingTemplate) {
        await api.updateShiftTemplate(editingTemplate.id, payload);
      } else {
        await api.createShiftTemplate(payload);
      }
      setIsDrawerOpen(false);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shift template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete shift template? This will fail if roster instances depend on it.")) return;
    try {
      await api.deleteShiftTemplate(id);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete shift template");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Shift Templates Master</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Define working schedules, multi-session split shifts (N65 break gap exclusion), and grace periods.
          </p>
        </div>

        {can("shift.template.create") ? (
          <button className="primary" type="button" onClick={openCreate}>
            <Plus size={16} /> Create Shift Template
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={{ padding: "0.6rem 0.8rem", background: "var(--danger-bg)", color: "var(--danger-fg)", borderRadius: "4px", fontSize: "0.82rem" }}>
          {error}
        </div>
      ) : null}

      {/* Templates Table */}
      <div className="panel" style={{ padding: 0 }}>
        {templates.length === 0 && !loading ? (
          <EmptyState
            icon={Clock}
            title="No shift templates"
            description="Create your first shift template to configure employee working hours and roster rotations."
            action={
              can("shift.template.create") ? (
                <button className="primary small" type="button" onClick={openCreate}>
                  <Plus size={14} /> Add Template
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container" style={{ border: "none" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Shift Code</th>
                  <th>Shift Name</th>
                  <th>Type</th>
                  <th>Sessions / Working Hours</th>
                  <th>Overnight</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          width: "16px",
                          height: "16px",
                          borderRadius: "3px",
                          background: tpl.color_code || "#0f766e",
                          verticalAlign: "middle",
                        }}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{tpl.code}</td>
                    <td>{tpl.name}</td>
                    {/* B5: Shift Type Badge */}
                    <td>
                      <Badge variant={tpl.shift_type === "SPLIT" ? "halfday" : "info"}>
                        {tpl.shift_type}
                      </Badge>
                    </td>
                    <td>
                      {tpl.sessions && tpl.sessions.length > 0 ? (
                        <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                          {tpl.sessions.map((s, idx) => (
                            <Badge key={idx} variant="neutral">
                              {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">Standard</span>
                      )}
                    </td>
                    <td>
                      {tpl.is_overnight ? (
                        <Badge variant="halfday">Overnight</Badge>
                      ) : (
                        <span className="text-muted">Day</span>
                      )}
                    </td>
                    <td>
                      <Badge variant={tpl.is_active ? "present" : "neutral"}>
                        {tpl.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="flex items-center" style={{ justifyContent: "flex-end", gap: "0.4rem" }}>
                        {can("shift.template.update") ? (
                          <button className="ghost small" type="button" onClick={() => openEdit(tpl)}>
                            <Edit size={14} /> Edit
                          </button>
                        ) : null}
                        {can("shift.template.delete") ? (
                          <button className="danger small" type="button" onClick={() => handleDelete(tpl.id)}>
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shift Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingTemplate ? `Edit Shift — ${editingTemplate.code}` : "Create Shift Template"}
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={saving || !code || !name || sessions.length === 0}
              onClick={handleSave}
            >
              {saving ? "Saving…" : editingTemplate ? "Update Shift" : "Create Shift"}
            </button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={handleSave}>
          <div className="form-grid">
            <div className="form-group">
              <label>Shift Code</label>
              <input
                value={code}
                disabled={!!editingTemplate}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. GS01, SPLIT01"
                required
              />
            </div>

            <div className="form-group">
              <label>Shift Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. General Day Shift"
                required
              />
            </div>

            <div className="form-group">
              <label>Shift Category / Type</label>
              <select value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
                <option value="FIXED">FIXED (Standard)</option>
                <option value="SPLIT">SPLIT (Multi-session breaks excluded)</option>
                <option value="OVERNIGHT">OVERNIGHT (Crosses midnight)</option>
                <option value="FLEXI">FLEXI (Flexible hours)</option>
                <option value="CONTINUOUS">CONTINUOUS (24x7 rotation)</option>
              </select>
            </div>

            {/* B1: Color Code Picker */}
            <div className="form-group">
              <label>Calendar Color Indicator</label>
              <div className="flex gap-1 items-center">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    style={{
                      width: "24px",
                      height: "24px",
                      padding: 0,
                      background: c,
                      border: colorCode === c ? "2px solid var(--text-primary)" : "1px solid var(--border-strong)",
                      borderRadius: "4px",
                    }}
                    onClick={() => setColorCode(c)}
                  />
                ))}
                <input
                  type="text"
                  value={colorCode}
                  onChange={(e) => setColorCode(e.target.value)}
                  style={{ width: "90px", marginLeft: "0.4rem" }}
                />
              </div>
            </div>
          </div>

          {/* Sessions Builder */}
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "1rem" }}>
            <div className="flex justify-between items-center" style={{ marginBottom: "0.75rem" }}>
              <h4>Shift Sessions & Working Windows ({sessions.length})</h4>
              <button className="ghost small" type="button" onClick={addSession}>
                <Plus size={14} /> Add Session (Split Shift)
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {sessions.map((sess, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: "6px",
                    padding: "0.85rem",
                    background: "var(--bg-subtle)",
                  }}
                >
                  <div className="flex justify-between items-center" style={{ marginBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                      Session #{sess.session_order}: {sess.name}
                    </span>
                    {sessions.length > 1 ? (
                      <button
                        className="danger small"
                        type="button"
                        onClick={() => removeSession(idx)}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Start Time</label>
                      <input
                        type="time"
                        value={sess.start_time}
                        onChange={(e) => {
                          const next = [...sessions];
                          next[idx].start_time = e.target.value;
                          setSessions(next);
                        }}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>End Time</label>
                      <input
                        type="time"
                        value={sess.end_time}
                        onChange={(e) => {
                          const next = [...sessions];
                          next[idx].end_time = e.target.value;
                          setSessions(next);
                        }}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Grace Late (Minutes)</label>
                      <input
                        type="number"
                        min="0"
                        value={sess.grace_period_late_minutes}
                        onChange={(e) => {
                          const next = [...sessions];
                          next[idx].grace_period_late_minutes = Number(e.target.value);
                          setSessions(next);
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Grace Early (Minutes)</label>
                      <input
                        type="number"
                        min="0"
                        value={sess.grace_period_early_minutes}
                        onChange={(e) => {
                          const next = [...sessions];
                          next[idx].grace_period_early_minutes = Number(e.target.value);
                          setSessions(next);
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Pre-Window Punch (Min)</label>
                      <input
                        type="number"
                        min="0"
                        value={sess.pre_window_minutes}
                        onChange={(e) => {
                          const next = [...sessions];
                          next[idx].pre_window_minutes = Number(e.target.value);
                          setSessions(next);
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Post-Window Punch (Min)</label>
                      <input
                        type="number"
                        min="0"
                        value={sess.post_window_minutes}
                        onChange={(e) => {
                          const next = [...sessions];
                          next[idx].post_window_minutes = Number(e.target.value);
                          setSessions(next);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
