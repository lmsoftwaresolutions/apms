import React, { useState } from "react";
import { Users, CheckCircle, Clock, AlertTriangle, Plus, RotateCw } from "lucide-react";
import { Me } from "../../api";

interface FloorCockpitProps {
  me: Me;
  onOpenTrace: (traceData: any) => void;
  onOpenRegularization: () => void;
  searchTerm: string;
}

export const FloorCockpit: React.FC<FloorCockpitProps> = ({
  onOpenTrace,
  onOpenRegularization,
  searchTerm,
}) => {
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("EXCEPTIONS");

  // Realistic mock floor roster matching PRODUCT.md & leaveattendancepayroll structure
  const workers = [
    {
      id: "w-1",
      name: "Sunil Varma",
      code: "EMP-1029",
      designation: "Spinning Operator",
      line: "Ring Frame Line 2",
      department: "SPIN",
      firstIn: "06:28 AM",
      punchDate: "24 Nov (Tue)",
      lastOut: "--:--",
      status: "LATE",
      statusLabel: "Late (+13m net)",
      source: "eTime Biometric (Gate 2)",
      sourceDevice: "bio_gate2_spinning",
      lateMinutes: 13,
      graceCutoff: "06:15 AM",
      ratio: 0.94,
    },
    {
      id: "w-2",
      name: "Amitesh Das",
      code: "EMP-1084",
      designation: "Carding Technician",
      line: "Carding Bay A",
      department: "SPIN",
      firstIn: "No Punch",
      punchDate: "24 Nov (Tue)",
      lastOut: "--:--",
      status: "MISSING",
      statusLabel: "Missing",
      source: "None captured",
      sourceDevice: "none",
      lateMinutes: 0,
      graceCutoff: "06:15 AM",
      ratio: 0.0,
    },
    {
      id: "w-3",
      name: "Kavita Murthy",
      code: "EMP-1102",
      designation: "Quality Inspector",
      line: "Testing Lab 1",
      department: "QA",
      firstIn: "05:54 AM",
      punchDate: "24 Nov (Tue)",
      lastOut: "--:--",
      status: "ON_TIME",
      statusLabel: "Present On Time",
      source: "RFID Door Turnstile",
      sourceDevice: "rfid_qa_turnstile",
      lateMinutes: 0,
      graceCutoff: "06:15 AM",
      ratio: 1.0,
    },
    {
      id: "w-4",
      name: "Deepak Rawat",
      code: "EMP-1045",
      designation: "Winding Operator",
      line: "Winding Bay 3",
      department: "WEAV",
      firstIn: "06:08 AM",
      punchDate: "24 Nov (Tue)",
      lastOut: "--:--",
      status: "GRACE",
      statusLabel: "Grace Used (OK)",
      source: "eTime Biometric (Gate 1)",
      sourceDevice: "bio_gate1_main",
      lateMinutes: 0,
      graceCutoff: "06:15 AM",
      ratio: 1.0,
    },
    {
      id: "w-5",
      name: "Ramesh Chand",
      code: "EMP-1011",
      designation: "Mechanical Tech",
      line: "Maintenance Bay",
      department: "MAINT",
      firstIn: "05:40 AM",
      punchDate: "24 Nov (Tue)",
      lastOut: "--:--",
      status: "EARLY",
      statusLabel: "Early Arrival (+20m)",
      source: "Mobile Geo-Punch",
      sourceDevice: "geo_app_plant1",
      lateMinutes: 0,
      graceCutoff: "06:15 AM",
      ratio: 1.0,
    },
  ];

  const filtered = workers.filter((w) => {
    if (departmentFilter !== "ALL" && w.department !== departmentFilter) return false;
    if (statusFilter === "EXCEPTIONS" && (w.status === "ON_TIME" || w.status === "EARLY")) return false;
    if (statusFilter === "ON_TIME" && w.status !== "ON_TIME") return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        w.code.toLowerCase().includes(q) ||
        w.designation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <section className="space-y-6">
      {/* 4 KPI Metrics Strip (Modeled after leaveattendancepayroll Dashboard.jsx) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scheduled */}
        <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scheduled Today</span>
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2 font-poppins">
            164 <span className="text-xs font-bold text-slate-400">workers</span>
          </div>
          <div className="text-[11px] font-bold text-slate-500 mt-1">Spinning (65) · Weaving (54) · QA (12)</div>
        </div>

        {/* Present / Clocked In */}
        <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Clocked In (On Floor)</span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2 font-poppins">
            148 <span className="text-xs font-bold text-emerald-700/80">(90.2%)</span>
          </div>
          <div className="text-[11px] font-bold text-emerald-600 mt-1">138 on time · 10 within 15m grace</div>
        </div>

        {/* Late Arrivals */}
        <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Late Arrivals</span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2 font-poppins">
            11 <span className="text-xs font-bold text-amber-700/80">flagged</span>
          </div>
          <div className="text-[11px] font-bold text-amber-600 mt-1">In after 06:15 AM cut-off</div>
        </div>

        {/* Missing / No Punch */}
        <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Missing / No Punch</span>
            <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2 font-poppins">
            5 <span className="text-xs font-bold text-rose-700/80">unmarked</span>
          </div>
          <div className="text-[11px] font-bold text-rose-600 mt-1">Fix roster before muster freezes</div>
        </div>
      </div>

      {/* Action / Filter Bar */}
      <div className="bg-white p-4 rounded-[28px] border border-slate-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-300 transition cursor-pointer"
          >
            <option value="ALL">All Departments</option>
            <option value="SPIN">Spinning Department (SPIN)</option>
            <option value="WEAV">Weaving Line (WEAV)</option>
            <option value="QA">Quality Assurance (QA)</option>
            <option value="MAINT">Maintenance (MAINT)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-300 transition cursor-pointer"
          >
            <option value="EXCEPTIONS">Show Exceptions (Late / Missing)</option>
            <option value="ALL">All Scheduled Workers</option>
            <option value="ON_TIME">On Time Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onOpenRegularization}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Supervisor Punch Override</span>
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Floor Roster Table */}
      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-100">
                <th className="px-6 py-3.5">Employee Details</th>
                <th className="px-6 py-3.5">Designation & Line</th>
                <th className="px-6 py-3.5">Punch In</th>
                <th className="px-6 py-3.5">Punch Out</th>
                <th className="px-6 py-3.5">Shift Status</th>
                <th className="px-6 py-3.5">Capture Source</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((w) => {
                const initials = w.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2);

                const isLate = w.status === "LATE";
                const isMissing = w.status === "MISSING";
                const isGrace = w.status === "GRACE";

                return (
                  <tr
                    key={w.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isMissing ? "bg-rose-50/20" : ""
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full font-black text-[11px] flex items-center justify-center border shrink-0 ${
                            isMissing
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : isLate
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : isGrace
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="flex flex-col leading-tight">
                          <span className="font-bold text-slate-800">{w.name}</span>
                          <span className="text-[10px] font-bold text-slate-400 font-mono">{w.code}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3.5">
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-slate-700">{w.designation}</span>
                        <span className="text-[10px] font-bold text-slate-400">{w.line}</span>
                      </div>
                    </td>

                    <td className="px-6 py-3.5">
                      <div className="flex flex-col leading-tight">
                        <span className="text-[9px] font-black text-slate-400 uppercase">{w.punchDate}</span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            isMissing
                              ? "text-rose-500"
                              : isLate
                              ? "text-amber-600"
                              : "text-slate-800"
                          }`}
                        >
                          {w.firstIn}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-3.5">
                      <span className="text-slate-300 text-xs font-mono">{w.lastOut}</span>
                    </td>

                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          isMissing
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : isLate
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : isGrace
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isMissing
                              ? "bg-rose-500"
                              : isLate
                              ? "bg-amber-500"
                              : isGrace
                              ? "bg-blue-500"
                              : "bg-emerald-500"
                          }`}
                        ></span>
                        {w.statusLabel}
                      </span>
                    </td>

                    <td className="px-6 py-3.5">
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-slate-700">{w.source}</span>
                        <span className="text-[10px] font-mono text-slate-400">{w.sourceDevice}</span>
                      </div>
                    </td>

                    <td className="px-6 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() =>
                          onOpenTrace({
                            workerName: w.name,
                            empCode: w.code,
                            shiftTitle: "Morning Shift A (06:00 – 14:00)",
                            firstIn: w.firstIn,
                            graceExpiry: w.graceCutoff,
                            lateMinutes: w.lateMinutes,
                            workedRatio: w.ratio,
                            status: w.status,
                          })
                        }
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition"
                      >
                        Explain Trace
                      </button>
                      {(isLate || isMissing) && (
                        <button
                          onClick={onOpenRegularization}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-xs rounded-xl transition"
                        >
                          Override
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div>Showing <strong>{filtered.length}</strong> of {workers.length} records</div>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled>
              Previous
            </button>
            <button className="px-3 py-1 bg-blue-600 text-white rounded-lg font-bold">1</button>
            <button className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50">Next</button>
          </div>
        </div>
      </div>
    </section>
  );
};

