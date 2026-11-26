import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Clock, Info, Layers, Moon, Sun } from "lucide-react";
import {
  api,
  PolicySummary,
  ShiftSessionInput,
  ShiftTemplate,
  ShiftTemplateCreateInput,
  ShiftTemplateUpdateInput,
} from "../../api";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { Modal } from "../../components/common/Modal";
import {
  computeGapMinutes,
  computeSessionDurationMinutes,
  formatDuration,
  formatTimeShort,
  parseTimeToMinutes,
  SHIFT_COLORS,
  toApiTime,
} from "./shiftUtils";

interface SessionDraft {
  name: string;
  start_time: string;
  end_time: string;
  grace_period_late_minutes: number;
  grace_period_early_minutes: number;
  break_duration_minutes: number;
  pre_window_minutes: number;
  post_window_minutes: number;
  min_presence_ratio: number;
}

const DEFAULT_S1: SessionDraft = {
  name: "Primary Session",
  start_time: "09:00",
  end_time: "18:00",
  grace_period_late_minutes: 15,
  grace_period_early_minutes: 15,
  break_duration_minutes: 60,
  pre_window_minutes: 60,
  post_window_minutes: 120,
  min_presence_ratio: 0.5,
};

const DEFAULT_SPLIT_S1: SessionDraft = {
  name: "First Half",
  start_time: "08:00",
  end_time: "12:00",
  grace_period_late_minutes: 15,
  grace_period_early_minutes: 15,
  break_duration_minutes: 0,
  pre_window_minutes: 60,
  post_window_minutes: 60,
  min_presence_ratio: 0.5,
};

const DEFAULT_SPLIT_S2: SessionDraft = {
  name: "Second Half",
  start_time: "16:00",
  end_time: "20:00",
  grace_period_late_minutes: 15,
  grace_period_early_minutes: 15,
  break_duration_minutes: 0,
  pre_window_minutes: 60,
  post_window_minutes: 120,
  min_presence_ratio: 0.5,
};

export interface ShiftTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTemplate: ShiftTemplate | null;
  policies: PolicySummary[];
  onSaved: () => Promise<void>;
}

export function ShiftTemplateModal({
  isOpen,
  onClose,
  editingTemplate,
  policies,
  onSaved,
}: ShiftTemplateModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [colorCode, setColorCode] = useState("#3b82f6");

  // Orthogonal axes: Session Architecture vs Special Operational Flags
  const [isSplit, setIsSplit] = useState(false);
  const [isOvernightFlag, setIsOvernightFlag] = useState(false);
  const [isContinuousFlag, setIsContinuousFlag] = useState(false);
  const [isFlexiFlag, setIsFlexiFlag] = useState(false);

  const [s1, setS1] = useState<SessionDraft>(DEFAULT_S1);
  const [s2, setS2] = useState<SessionDraft>(DEFAULT_SPLIT_S2);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setShowAdvanced(false);

    if (editingTemplate) {
      setCode(editingTemplate.code);
      setName(editingTemplate.name);
      setPolicyId(editingTemplate.policy_id || "");
      setColorCode(editingTemplate.color_code || "#3b82f6");

      const sorted = [...editingTemplate.sessions].sort(
        (a, b) => a.session_order - b.session_order,
      );
      const split = sorted.length > 1 || editingTemplate.shift_type === "SPLIT";
      setIsSplit(split);
      setIsOvernightFlag(editingTemplate.is_overnight || editingTemplate.shift_type === "OVERNIGHT");
      setIsContinuousFlag(editingTemplate.shift_type === "CONTINUOUS");
      setIsFlexiFlag(editingTemplate.shift_type === "FLEXI");

      if (sorted[0]) {
        setS1({
          name: sorted[0].name,
          start_time: formatTimeShort(sorted[0].start_time),
          end_time: formatTimeShort(sorted[0].end_time),
          grace_period_late_minutes: sorted[0].grace_period_late_minutes,
          grace_period_early_minutes: sorted[0].grace_period_early_minutes,
          break_duration_minutes: sorted[0].break_duration_minutes,
          pre_window_minutes: sorted[0].pre_window_minutes,
          post_window_minutes: sorted[0].post_window_minutes,
          min_presence_ratio: parseFloat(sorted[0].min_presence_ratio) || 0.5,
        });
      } else {
        setS1(DEFAULT_S1);
      }

      if (sorted[1]) {
        setS2({
          name: sorted[1].name,
          start_time: formatTimeShort(sorted[1].start_time),
          end_time: formatTimeShort(sorted[1].end_time),
          grace_period_late_minutes: sorted[1].grace_period_late_minutes,
          grace_period_early_minutes: sorted[1].grace_period_early_minutes,
          break_duration_minutes: sorted[1].break_duration_minutes,
          pre_window_minutes: sorted[1].pre_window_minutes,
          post_window_minutes: sorted[1].post_window_minutes,
          min_presence_ratio: parseFloat(sorted[1].min_presence_ratio) || 0.5,
        });
      } else {
        setS2(DEFAULT_SPLIT_S2);
      }
    } else {
      setCode("");
      setName("");
      setPolicyId("");
      setColorCode("#3b82f6");
      setIsSplit(false);
      setIsOvernightFlag(false);
      setIsContinuousFlag(false);
      setIsFlexiFlag(false);
      setS1(DEFAULT_S1);
      setS2(DEFAULT_SPLIT_S2);
    }
  }, [isOpen, editingTemplate]);

  // Auto-detect overnight when end_time < start_time
  const s1CrossesMidnight =
    parseTimeToMinutes(s1.end_time) < parseTimeToMinutes(s1.start_time);
  const s2CrossesMidnight =
    isSplit && parseTimeToMinutes(s2.end_time) < parseTimeToMinutes(s2.start_time);
  const effectiveOvernight = isOvernightFlag || s1CrossesMidnight || s2CrossesMidnight;

  const s1Duration = computeSessionDurationMinutes(s1.start_time, s1.end_time);
  const s2Duration = isSplit ? computeSessionDurationMinutes(s2.start_time, s2.end_time) : 0;
  const gapMinutes = isSplit ? computeGapMinutes(s1.end_time, s2.start_time) : 0;

  const totalScheduledMinutes = s1Duration + s2Duration;
  const totalBreakMinutes =
    s1.break_duration_minutes + (isSplit ? s2.break_duration_minutes : 0);
  const netWorkingMinutes = Math.max(0, totalScheduledMinutes - totalBreakMinutes);

  const hasSessionOverlap = isSplit && !s1CrossesMidnight && !s2CrossesMidnight && gapMinutes < 0;
  const hasInvalidZeroDuration = s1Duration === 0 || (isSplit && s2Duration === 0);

  function handleArchitectureChange(splitMode: boolean) {
    setIsSplit(splitMode);
    if (!editingTemplate) {
      if (splitMode) {
        setS1(DEFAULT_SPLIT_S1);
        setS2(DEFAULT_SPLIT_S2);
      } else {
        setS1(DEFAULT_S1);
      }
    }
  }

  function resolveShiftType(): string {
    if (isSplit) return "SPLIT";
    if (isContinuousFlag) return "CONTINUOUS";
    if (effectiveOvernight) return "OVERNIGHT";
    if (isFlexiFlag) return "FLEXI";
    return "FIXED";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!editingTemplate && !/^[A-Z0-9_-]{2,50}$/.test(trimmedCode)) {
      setError("Shift code must be 2–50 uppercase letters, numbers, hyphens, or underscores.");
      return;
    }
    if (!trimmedName) {
      setError("Shift name is required.");
      return;
    }
    if (hasInvalidZeroDuration) {
      setError("Session start and end times cannot be identical.");
      return;
    }
    if (hasSessionOverlap) {
      setError("Session 2 start time must be after Session 1 end time.");
      return;
    }

    const sessionsPayload: ShiftSessionInput[] = [
      {
        session_order: 1,
        name: s1.name.trim() || (isSplit ? "First Half" : "Primary Session"),
        start_time: toApiTime(s1.start_time),
        end_time: toApiTime(s1.end_time),
        pre_window_minutes: s1.pre_window_minutes,
        post_window_minutes: s1.post_window_minutes,
        grace_period_late_minutes: s1.grace_period_late_minutes,
        grace_period_early_minutes: s1.grace_period_early_minutes,
        min_presence_ratio: s1.min_presence_ratio,
        break_duration_minutes: s1.break_duration_minutes,
      },
    ];

    if (isSplit) {
      sessionsPayload.push({
        session_order: 2,
        name: s2.name.trim() || "Second Half",
        start_time: toApiTime(s2.start_time),
        end_time: toApiTime(s2.end_time),
        pre_window_minutes: s2.pre_window_minutes,
        post_window_minutes: s2.post_window_minutes,
        grace_period_late_minutes: s2.grace_period_late_minutes,
        grace_period_early_minutes: s2.grace_period_early_minutes,
        min_presence_ratio: s2.min_presence_ratio,
        break_duration_minutes: s2.break_duration_minutes,
      });
    }

    setSubmitting(true);
    setError("");

    try {
      if (editingTemplate) {
        const updatePayload: ShiftTemplateUpdateInput = {
          name: trimmedName,
          color_code: colorCode,
          policy_id: policyId || null,
          sessions: sessionsPayload,
        };
        await api.updateShiftTemplate(editingTemplate.id, updatePayload);
      } else {
        const createPayload: ShiftTemplateCreateInput = {
          code: trimmedCode,
          name: trimmedName,
          shift_type: resolveShiftType(),
          color_code: colorCode,
          policy_id: policyId || null,
          sessions: sessionsPayload,
        };
        await api.createShiftTemplate(createPayload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shift template");
    } finally {
      setSubmitting(false);
    }
  }

  // Timeline bar percentages relative to 24h (1440m) or extended span
  const s1StartMin = parseTimeToMinutes(s1.start_time);
  const timelineSpan = effectiveOvernight ? 1440 + parseTimeToMinutes(s1.end_time) : 1440;
  const s1LeftPct = Math.min(100, (s1StartMin / timelineSpan) * 100);
  const s1WidthPct = Math.max(4, Math.min(100 - s1LeftPct, (s1Duration / timelineSpan) * 100));

  const s2StartMin = isSplit ? parseTimeToMinutes(s2.start_time) : 0;
  const gapLeftPct = s1LeftPct + s1WidthPct;
  const gapWidthPct =
    isSplit && gapMinutes > 0
      ? Math.max(2, Math.min(100 - gapLeftPct, (gapMinutes / timelineSpan) * 100))
      : 0;
  const s2LeftPct = Math.min(100, (s2StartMin / timelineSpan) * 100);
  const s2WidthPct =
    isSplit && !hasSessionOverlap
      ? Math.max(4, Math.min(100 - s2LeftPct, (s2Duration / timelineSpan) * 100))
      : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={editingTemplate ? `Edit Shift Template — ${editingTemplate.code}` : "Add Shift Template"}
      description="Configure operational hours, session boundaries, and N65 mid-shift non-working gaps."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="shift-template-form"
            variant="primary"
            loading={submitting}
            disabled={hasSessionOverlap || hasInvalidZeroDuration}
          >
            {editingTemplate ? "Save Changes" : "Create Shift Template"}
          </Button>
        </>
      }
    >
      <form id="shift-template-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        ) : null}

        {/* Row 1: Basic Identification & Policy */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.6fr 1.4fr",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Field label="Shift Code" required help="Unique uppercase ID (e.g. GEN, SPLIT-1)">
            <input
              className="input"
              placeholder="e.g. GEN"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={Boolean(editingTemplate)}
              required
              maxLength={50}
            />
          </Field>

          <Field label="Shift Name" required>
            <input
              className="input"
              placeholder="e.g. General Day Shift"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
            />
          </Field>

          <Field label="Linked Policy Master" help="Grace & OT rules (M06)">
            <select
              className="select"
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
            >
              <option value="">— Tenant Default Policy —</option>
              {policies
                .filter((p) => p.is_active || p.id === policyId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
            </select>
          </Field>
        </div>

        {/* Row 2: Orthogonal Axes (Session Type vs Special Operational Flags) + Color */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "1rem",
            padding: "0.875rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-subtle)",
            marginBottom: "1rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "0.5rem",
                letterSpacing: "0.04em",
              }}
            >
              Session Architecture
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="sessionArch"
                  checked={!isSplit}
                  onChange={() => handleArchitectureChange(false)}
                />
                <Sun size={14} color="var(--text-muted)" />
                Single Continuous Session
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="sessionArch"
                  checked={isSplit}
                  onChange={() => handleArchitectureChange(true)}
                />
                <Layers size={14} color="var(--text-muted)" />
                Split Shift (2 Sessions with N65 Gap)
              </label>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "0.5rem",
                letterSpacing: "0.04em",
              }}
            >
              Special Operational Flags
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={effectiveOvernight}
                  onChange={(e) => setIsOvernightFlag(e.target.checked)}
                />
                <Moon size={14} color="var(--text-muted)" />
                Cross-Midnight Overnight (+1d roll)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isContinuousFlag}
                  disabled={isSplit}
                  onChange={(e) => {
                    setIsContinuousFlag(e.target.checked);
                    if (e.target.checked) setIsFlexiFlag(false);
                  }}
                />
                <Clock size={14} color="var(--text-muted)" />
                Continuous Multi-Day Duty (&gt;24h)
              </label>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "0.5rem",
                letterSpacing: "0.04em",
              }}
            >
              Badge Color
            </div>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", maxWidth: "120px" }}>
              {SHIFT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColorCode(c.value)}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: c.value,
                    border: colorCode === c.value ? "2px solid var(--text-primary)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Session 1 Card */}
        <SessionEditorCard
          title={isSplit ? "Session 1 (First Half)" : "Scheduled Session"}
          session={s1}
          onChange={setS1}
          durationMinutes={s1Duration}
          crossesMidnight={s1CrossesMidnight}
          showAdvanced={showAdvanced}
        />

        {/* N65 Mid-Session Gap Banner & Session 2 */}
        {isSplit ? (
          <>
            <div
              style={{
                margin: "0.75rem 0",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius)",
                border: hasSessionOverlap
                  ? "1px solid var(--color-danger)"
                  : "1px dashed var(--border-default)",
                background: hasSessionOverlap
                  ? "var(--color-danger-bg)"
                  : "var(--bg-subtle)",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.65rem",
              }}
            >
              {hasSessionOverlap ? (
                <AlertTriangle size={18} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: "2px" }} />
              ) : (
                <Info size={18} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
              )}
              <div style={{ fontSize: "0.825rem" }}>
                {hasSessionOverlap ? (
                  <strong style={{ color: "var(--color-danger)" }}>
                    Invalid Session Order: Session 2 starts before Session 1 ends ({formatTimeShort(s2.start_time)} &lt; {formatTimeShort(s1.end_time)}).
                  </strong>
                ) : (
                  <>
                    <strong>
                      Confirmed N65 Mid-Session Gap: {formatTimeShort(s1.end_time)} – {formatTimeShort(s2.start_time)} ({formatDuration(gapMinutes)})
                    </strong>
                    <div style={{ color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      Strictly non-working interval excluded from worked hours and overtime. Stray punches inside this gap are ignored.
                    </div>
                  </>
                )}
              </div>
            </div>

            <SessionEditorCard
              title="Session 2 (Second Half)"
              session={s2}
              onChange={setS2}
              durationMinutes={s2Duration}
              crossesMidnight={s2CrossesMidnight}
              showAdvanced={showAdvanced}
            />
          </>
        ) : null}

        <div style={{ marginTop: "0.5rem", marginBottom: "1rem", textAlign: "right" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAdvanced((v) => !v)}
            style={{ fontSize: "0.8rem" }}
          >
            {showAdvanced ? "Hide Ingestion Windows & Presence Ratio" : "Configure Ingestion Windows & Presence Ratio"}
          </button>
        </div>

        {/* Visual Timeline Preview */}
        <div
          style={{
            padding: "0.875rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-card)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.6rem",
              fontSize: "0.8rem",
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.04em" }}>
              Visual Timeline Preview
            </span>
            <span style={{ color: "var(--text-primary)" }}>
              Scheduled: <strong>{formatDuration(totalScheduledMinutes)}</strong>
              {totalBreakMinutes > 0 ? ` • Break: ${totalBreakMinutes}m` : ""}
              {" • "}Net Work: <strong style={{ color: "var(--color-primary)" }}>{formatDuration(netWorkingMinutes)}</strong>
            </span>
          </div>

          {/* 24h / Overnight Bar */}
          <div
            style={{
              position: "relative",
              height: "28px",
              borderRadius: "6px",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
            }}
          >
            {/* Session 1 Bar */}
            <div
              title={`Session 1: ${formatTimeShort(s1.start_time)} - ${formatTimeShort(s1.end_time)}`}
              style={{
                position: "absolute",
                left: `${s1LeftPct}%`,
                width: `${s1WidthPct}%`,
                top: 0,
                bottom: 0,
                background: colorCode,
                color: "#fff",
                fontSize: "0.7rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {s1WidthPct > 12 ? `S1 (${formatDuration(s1Duration)})` : "S1"}
            </div>

            {/* N65 Gap Bar */}
            {isSplit && gapWidthPct > 0 ? (
              <div
                title={`N65 Non-Working Gap: ${formatDuration(gapMinutes)}`}
                style={{
                  position: "absolute",
                  left: `${gapLeftPct}%`,
                  width: `${gapWidthPct}%`,
                  top: 0,
                  bottom: 0,
                  background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(148,163,184,0.22) 4px, rgba(148,163,184,0.22) 8px)",
                  color: "var(--text-muted)",
                  fontSize: "0.68rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                {gapWidthPct > 12 ? `N65 Gap (${formatDuration(gapMinutes)})` : ""}
              </div>
            ) : null}

            {/* Session 2 Bar */}
            {isSplit && s2WidthPct > 0 ? (
              <div
                title={`Session 2: ${formatTimeShort(s2.start_time)} - ${formatTimeShort(s2.end_time)}`}
                style={{
                  position: "absolute",
                  left: `${s2LeftPct}%`,
                  width: `${s2WidthPct}%`,
                  top: 0,
                  bottom: 0,
                  background: colorCode,
                  color: "#fff",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                {s2WidthPct > 12 ? `S2 (${formatDuration(s2Duration)})` : "S2"}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "0.35rem",
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>{effectiveOvernight ? "+1d 06:00" : "24:00"}</span>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function SessionEditorCard({
  title,
  session,
  onChange,
  durationMinutes,
  crossesMidnight,
  showAdvanced,
}: {
  title: string;
  session: SessionDraft;
  onChange: (next: SessionDraft) => void;
  durationMinutes: number;
  crossesMidnight: boolean;
  showAdvanced: boolean;
}) {
  return (
    <div
      style={{
        padding: "0.875rem",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border-subtle)",
        background: "var(--bg-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.65rem",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{title}</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Span: <strong>{formatDuration(durationMinutes)}</strong>
          {crossesMidnight ? " (+1d overnight)" : ""}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 0.8fr 0.8fr 0.8fr",
          gap: "0.65rem",
        }}
      >
        <Field label="Start Time" required>
          <input
            type="time"
            className="input"
            value={session.start_time}
            onChange={(e) => onChange({ ...session, start_time: e.target.value })}
            required
          />
        </Field>

        <Field label="End Time" required>
          <input
            type="time"
            className="input"
            value={session.end_time}
            onChange={(e) => onChange({ ...session, end_time: e.target.value })}
            required
          />
        </Field>

        <Field label="Grace In (m)">
          <input
            type="number"
            min={0}
            max={180}
            className="input"
            value={session.grace_period_late_minutes}
            onChange={(e) =>
              onChange({
                ...session,
                grace_period_late_minutes: Math.max(0, parseInt(e.target.value || "0", 10)),
              })
            }
          />
        </Field>

        <Field label="Grace Out (m)">
          <input
            type="number"
            min={0}
            max={180}
            className="input"
            value={session.grace_period_early_minutes}
            onChange={(e) =>
              onChange({
                ...session,
                grace_period_early_minutes: Math.max(0, parseInt(e.target.value || "0", 10)),
              })
            }
          />
        </Field>

        <Field label="Break (m)">
          <input
            type="number"
            min={0}
            max={240}
            className="input"
            value={session.break_duration_minutes}
            onChange={(e) =>
              onChange({
                ...session,
                break_duration_minutes: Math.max(0, parseInt(e.target.value || "0", 10)),
              })
            }
          />
        </Field>
      </div>

      {showAdvanced ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
            gap: "0.65rem",
            marginTop: "0.65rem",
            paddingTop: "0.65rem",
            borderTop: "1px dashed var(--border-subtle)",
          }}
        >
          <Field label="Session Name">
            <input
              className="input"
              value={session.name}
              onChange={(e) => onChange({ ...session, name: e.target.value })}
              maxLength={100}
            />
          </Field>
          <Field label="Pre-Window (m)">
            <input
              type="number"
              min={0}
              max={360}
              className="input"
              value={session.pre_window_minutes}
              onChange={(e) =>
                onChange({
                  ...session,
                  pre_window_minutes: Math.max(0, parseInt(e.target.value || "0", 10)),
                })
              }
            />
          </Field>
          <Field label="Post-Window (m)">
            <input
              type="number"
              min={0}
              max={480}
              className="input"
              value={session.post_window_minutes}
              onChange={(e) =>
                onChange({
                  ...session,
                  post_window_minutes: Math.max(0, parseInt(e.target.value || "0", 10)),
                })
              }
            />
          </Field>
          <Field label="Min Presence">
            <input
              type="number"
              step="0.05"
              min={0}
              max={1}
              className="input"
              value={session.min_presence_ratio}
              onChange={(e) =>
                onChange({
                  ...session,
                  min_presence_ratio: Math.min(1, Math.max(0, parseFloat(e.target.value || "0.5"))),
                })
              }
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
