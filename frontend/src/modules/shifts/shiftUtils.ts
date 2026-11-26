export const SHIFT_COLORS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Slate", value: "#64748b" },
];

export function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  const h = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  return h * 60 + m;
}

export function formatTimeShort(timeStr: string): string {
  const parts = timeStr.split(":");
  return `${(parts[0] || "00").padStart(2, "0")}:${(parts[1] || "00").padStart(2, "0")}`;
}

export function toApiTime(timeStr: string): string {
  return `${formatTimeShort(timeStr)}:00`;
}

export function computeSessionDurationMinutes(start: string, end: string): number {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (e < s) {
    return 1440 - s + e;
  }
  return e - s;
}

export function computeGapMinutes(s1End: string, s2Start: string): number {
  const e1 = parseTimeToMinutes(s1End);
  const s2 = parseTimeToMinutes(s2Start);
  return s2 - e1;
}

export function formatDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
