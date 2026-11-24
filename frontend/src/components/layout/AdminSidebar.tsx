import React from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  Zap,
  Clock,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { Me } from "../../api";

interface AdminSidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  me: Me;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ currentTab, onSelectTab, me }) => {
  const initial = me.tenant.display_name.slice(0, 2).toUpperCase() || "AP";

  return (
    <aside className="w-full md:w-64 bg-slate-900 text-slate-300 shrink-0 flex flex-col min-h-screen border-r border-slate-800 select-none">
      {/* Brand / Tenant Box (Matches leaveattendancepayroll AdminLayout) */}
      <div className="h-24 flex items-center gap-3.5 border-b border-slate-800 px-6">
        <div className="h-12 w-12 shrink-0 bg-white rounded-xl flex items-center justify-center p-1 shadow-lg shadow-black/20 text-slate-900 font-black text-lg tracking-tight font-poppins">
          {me.tenant.logo_url ? (
            <img src={me.tenant.logo_url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            initial
          )}
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-black text-white tracking-tight leading-none mb-1 font-poppins truncate">
            {me.tenant.display_name.toUpperCase()}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
            WORKFORCE OPS
          </span>
        </div>
      </div>

      {/* Nav Menu with Categorized Headers */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 pt-2 pb-1.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">OPERATIONS</span>
        </div>

        <button
          onClick={() => onSelectTab("floor")}
          className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
            currentTab === "floor"
              ? "bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>Floor Live Cockpit</span>
        </button>

        <button
          onClick={() => onSelectTab("attendance")}
          className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
            currentTab === "attendance"
              ? "bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <CalendarCheck className="w-4 h-4 shrink-0" />
          <span>Attendance Muster</span>
        </button>

        <button
          onClick={() => onSelectTab("punches")}
          className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
            currentTab === "punches"
              ? "bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Zap className="w-4 h-4 shrink-0" />
          <span>Raw Punch Stream</span>
        </button>

        <div className="px-3 pt-5 pb-1.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">ROSTER & SHIFTS</span>
        </div>

        <button
          onClick={() => onSelectTab("roster")}
          className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
            currentTab === "roster"
              ? "bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>Shift Master & Roster</span>
        </button>

        <div className="px-3 pt-5 pb-1.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">ORGANIZATION</span>
        </div>

        <button
          onClick={() => onSelectTab("org")}
          className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
            currentTab === "org"
              ? "bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span>Branches & Structure</span>
        </button>

        <button
          onClick={() => onSelectTab("iam")}
          className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition-all ${
            currentTab === "iam"
              ? "bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>IAM & Permissions</span>
        </button>
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-bold text-slate-300">Biometric: Online</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">v0.1.0</span>
      </div>
    </aside>
  );
};

