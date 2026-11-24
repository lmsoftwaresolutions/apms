import React from "react";
import { Plus, Check } from "lucide-react";

export const ShiftMasterView: React.FC = () => {
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Shift Templates Column */}
        <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-blue-600"></div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-poppins">Shift Master</h3>
            </div>
            <button
              onClick={() => alert("Add shift template form")}
              className="text-blue-600 font-bold text-xs hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> New Shift
            </button>
          </div>
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Morning Shift A (MORN-A)</span>
                <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">8.00 hrs</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">06:00 to 14:00 · Grace period: 15 min</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Evening Shift B (EVEN-B)</span>
                <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">8.00 hrs</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">14:00 to 22:00 · Grace period: 15 min</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Night Shift C (NGHT-C)</span>
                <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded">NIGHT (8h)</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">22:00 to 06:00 (Overnight cross-midnight)</div>
            </div>
          </div>
        </div>

        {/* 30-Day Concrete Shift Materialization (ADR-15) */}
        <div className="md:col-span-2 bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-emerald-600"></div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-poppins">
                  Concrete Shift Materialization (ADR-15)
                </h3>
                <p className="text-[11px] text-slate-400">Deterministic 30-day dated shift instances</p>
              </div>
            </div>
            <button
              onClick={() => alert("Materialized 30 days for 164 workers across active lines.")}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition"
            >
              Materialize 30 Days
            </button>
          </div>

          <div className="space-y-2">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
              <div>
                <div className="font-mono font-bold text-slate-800">2026-11-24 · Morning Shift A (06:00 – 14:00)</div>
                <div className="text-slate-500 text-xs mt-0.5">Assigned to: Sunil Varma (EMP-1029) · Spinning Line 2</div>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Check className="w-3 h-3" /> Materialized
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
              <div>
                <div className="font-mono font-bold text-slate-800">2026-11-24 · Morning Shift A (06:00 – 14:00)</div>
                <div className="text-slate-500 text-xs mt-0.5">Assigned to: Amitesh Das (EMP-1084) · Carding Bay A</div>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Pending Supervisor Override
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

