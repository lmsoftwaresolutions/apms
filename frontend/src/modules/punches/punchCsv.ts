import { PunchIngestResult } from "../../api";

export interface CsvPreviewRow {
  line: number;
  employee_code: string;
  punch_time: string;
  direction: string;
  valid: boolean;
}

const CODE_HEADERS = ["employee_code", "emp_code", "empcode", "code", "pin"];
const TIME_HEADERS = ["punch_time", "punchdate", "timestamp", "datetime", "time"];
const DIR_HEADERS = ["direction", "punch_direction", "type", "status"];
const DATE_HEADERS = ["date", "punch_date"];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

/** Naive punch timestamps are stored as IST. Match the CSV adapter's accepted shapes. */
export function isIstPunchTime(value: string): boolean {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(text)) return true;
  if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(text)) return true;
  if (/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(text)) return true;
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return true;
  return false;
}

export function parseCsvPreview(text: string): CsvPreviewRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const codeIdx = headerIndex(headers, CODE_HEADERS);
  const timeIdx = headerIndex(headers, TIME_HEADERS);
  const dirIdx = headerIndex(headers, DIR_HEADERS);
  const dateIdx = headerIndex(headers, DATE_HEADERS);
  if (codeIdx < 0) return [];

  return lines.slice(1).map((line, index) => {
    const cols = splitCsvLine(line);
    const code = cols[codeIdx] || "";
    const timePart = timeIdx >= 0 ? cols[timeIdx] || "" : "";
    const datePart = dateIdx >= 0 ? cols[dateIdx] || "" : "";
    const punchTime = datePart && timePart ? `${datePart} ${timePart}` : timePart;
    const direction = dirIdx >= 0 ? cols[dirIdx] || "UNKNOWN" : "UNKNOWN";
    return {
      line: index + 2,
      employee_code: code,
      punch_time: punchTime,
      direction,
      valid: Boolean(code) && isIstPunchTime(punchTime),
    };
  });
}

export function istDateStamp(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function istDateTimeLocal(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function ingestOutcome(result: PunchIngestResult): { tone: "success" | "warning"; title: string } {
  if (result.is_duplicate) {
    return { tone: "warning", title: "This exact payload was already stored" };
  }
  if (result.total_received === 0) {
    return { tone: "warning", title: "No punch rows could be read" };
  }
  if (result.active_punches === 0 && result.unmatched_employees.length > 0) {
    return { tone: "warning", title: "No rows matched an active employee" };
  }
  if (result.active_punches === 0 && result.duplicates_ignored > 0) {
    return { tone: "warning", title: "Punches fell inside the 60-second window" };
  }
  if (result.active_punches === 0) {
    return { tone: "warning", title: "Envelope stored, with no active punches" };
  }
  return { tone: "success", title: "Punches stored on the ledger" };
}
