import React from "react";
import { Search, LogOut } from "lucide-react";
import { Me } from "../../api";

interface TopHeaderProps {
  me: Me;
  onSignOut: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ me, onSignOut, searchTerm, onSearchChange }) => {
  const initials = me.full_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AD";

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      {/* Search & Active Shift Indicator */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search workers, employee code (EMP-...), or ID..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition"
          />
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">LIVE SHIFT:</span>
          <span className="text-xs font-bold text-slate-700">Morning Shift A (06:00 – 14:00)</span>
        </div>
      </div>

      {/* User Avatar & Logout */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shadow-xs">
            {initials}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-black text-slate-800 leading-tight">{me.full_name}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {me.permissions.includes("iam.role.read") ? "Org Administrator" : "Shift Supervisor"}
            </span>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

