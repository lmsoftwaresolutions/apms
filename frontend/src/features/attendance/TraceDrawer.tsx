import React from "react";
import { X } from "lucide-react";

interface TraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  record: {
    workerName: string;
    empCode: string;
    shiftTitle: string;
    firstIn: string;
    graceExpiry: string;
    lateMinutes: number;
    workedRatio: number;
    status: string;
    rawPayload?: Record<string, unknown>;
  } | null;
}

export const TraceDrawer: React.FC<TraceDrawerProps> = ({ isOpen, onClose, record }) => {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-end p-0">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <h3 className="font-black text-sm tracking-tight font-poppins">Immutable Attendance Explanation Trace</h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Deterministic rule trace evaluated under ADR-15</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 text-lg font-bold">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Summary Box */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Worker:</span>
              <strong className="text-slate-800 font-bold">{record.workerName} ({record.empCode})</strong>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Shift Instance:</span>
              <strong className="text-slate-800 font-mono">{record.shiftTitle}</strong>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Grace Window:</span>
              <strong className="text-slate-800">Cut-off at {record.graceExpiry}</strong>
            </div>
          </div>

          {/* Mathematical Rule Breakdown */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mathematical Decision Sequence:</h4>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <span className="text-blue-600 font-bold">01. SHIFT_WINDOW:</span> Scheduled start evaluated with configured grace period. Cutoff: {record.graceExpiry}.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <span className="text-blue-600 font-bold">02. RAW_PUNCH:</span> First valid IN punch registered at {record.firstIn} via multi-modal adapter.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <span className="text-amber-600 font-bold">03. LATENESS_MATH:</span> Actual IN ({record.firstIn}) evaluated against cut-off. Lateness deducted: <strong>{record.lateMinutes} minutes</strong>.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <span className="text-emerald-600 font-bold">04. DECISION:</span> Status assigned <span className="text-emerald-700 font-bold bg-emerald-100 px-1 py-0.5 rounded">{record.status}</span>. Worked ratio = {record.workedRatio.toFixed(2)}.
              </div>
            </div>
          </div>

          {/* JSON Payload */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Raw Immutable JSON Trace:</h4>
            <pre className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-3 rounded-xl overflow-x-auto max-h-48 border border-slate-800">
{JSON.stringify(
  record.rawPayload || {
    evaluated_at: new Date().toISOString(),
    ruleset_version: "v1.4-deterministic",
    worker: record.workerName,
    emp_code: record.empCode,
    shift: record.shiftTitle,
    first_in: record.firstIn,
    late_minutes: record.lateMinutes,
    status: record.status,
    worked_ratio: record.workedRatio,
  },
  null,
  2
)}</pre>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};

