import { DatedShiftInstance, ShiftTemplate } from "../../api";
import { parseTimeToMinutes } from "../shifts/shiftUtils";

export interface CalendarDay {
  dateStr: string;
  dayNum: string;
  weekday: string;
  isWeekend: boolean;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function getMonthDays(year: number, monthZeroIndexed: number): CalendarDay[] {
  const daysInMonth = new Date(year, monthZeroIndexed + 1, 0).getDate();
  const result: CalendarDay[] = [];
  const mm = String(monthZeroIndexed + 1).padStart(2, "0");

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthZeroIndexed, d);
    const dd = String(d).padStart(2, "0");
    const dow = dt.getDay();
    result.push({
      dateStr: `${year}-${mm}-${dd}`,
      dayNum: dd,
      weekday: WEEKDAYS[dow],
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return result;
}

export function formatMonthYear(year: number, monthZeroIndexed: number): string {
  return new Date(year, monthZeroIndexed, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Python weekday: Monday is 0 and Sunday is 6. */
export function pythonWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Computes the rest gap in hours between the previous day's shift end
 * and the candidate override shift's start on the target date.
 * Returns null if either shift is a rest day or has no sessions.
 */
export function computeRestGapHours(
  prevInstance: DatedShiftInstance | undefined,
  nextTemplate: ShiftTemplate | undefined,
): number | null {
  if (!prevInstance || prevInstance.is_rest_day || prevInstance.status === "CANCELLED_PAID") {
    return null;
  }
  if (!nextTemplate || nextTemplate.sessions.length === 0 || prevInstance.sessions.length === 0) {
    return null;
  }

  const prevSessions = [...prevInstance.sessions].sort(
    (a, b) => a.session_order - b.session_order,
  );
  const lastPrev = prevSessions[prevSessions.length - 1];
  const prevStartMin = parseTimeToMinutes(lastPrev.start_time);
  const prevEndMin = parseTimeToMinutes(lastPrev.end_time);
  const prevCrossesMidnight = Boolean(lastPrev.is_overnight) || prevEndMin < prevStartMin;

  // End time relative to Day D 00:00 (negative if ended on D-1, positive if crossed midnight into Day D)
  const prevEndRelToD0 = prevCrossesMidnight ? prevEndMin : prevEndMin - 1440;

  const nextSessions = [...nextTemplate.sessions].sort(
    (a, b) => a.session_order - b.session_order,
  );
  const firstNext = nextSessions[0];
  const nextStartMin = parseTimeToMinutes(firstNext.start_time);

  const gapMinutes = nextStartMin - prevEndRelToD0;
  return Math.round((gapMinutes / 60) * 10) / 10;
}
