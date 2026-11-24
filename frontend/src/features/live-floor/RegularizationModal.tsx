import React, { useState } from "react";
import { X } from "lucide-react";

interface RegularizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { employeeId: string; punchTime: string; direction: string; reason: string }) => void;
  employees: Array<{ id: string; full_name: string; employee_code: string }>;
}

export const RegularizationModal: React.FC<RegularizationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employees,
}) => {
  const [employeeId, setEmployeeId] = useState("");
  const [punchTime, setPunchTime] = useState("06:05");
  const [direction, setDirection] = useState("IN");
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      employeeId: employeeId || employees[0]?.id || "",
      punchTime,
      direction,
      reason,
    });
    setReason("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] border border-slate-100 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header (Matching leaveattendancepayroll InlineForm style) */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-5 rounded-full bg-blue-600"></div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-poppins">
              Supervisor Punch Regularization
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg font-bold">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          Record verified missed punch or roster adjustment. An explanation audit trace will be permanently recorded with your supervisor ID.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Employee <span className="text-blue-500">*</span>
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            >
              {employees.length > 0 ? (
                employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_code})
                  </option>
                ))
              ) : (
                <option value="demo">Amitesh Das (EMP-1084)</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Verified Punch Time <span className="text-blue-500">*</span>
              </label>
              <input
                type="time"
                value={punchTime}
                onChange={(e) => setPunchTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Direction <span className="text-blue-500">*</span>
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              >
                <option value="IN">IN (Shift Entry)</option>
                <option value="OUT">OUT (Shift Exit)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Reason / Floor Verification Note <span className="text-blue-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State exact reason (e.g., Gate 2 biometric optical reader queue delay, verified presence on Ring Frame Line 2 by Rajesh Sharma)"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              Submit & Recompute Muster
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

