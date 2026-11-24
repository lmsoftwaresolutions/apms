import React, { FormEvent, useEffect, useState } from "react";
import { api, loadToken, Me, saveToken } from "./api";
import { AdminSidebar } from "./components/layout/AdminSidebar";
import { TopHeader } from "./components/layout/TopHeader";
import { FloorCockpit } from "./features/live-floor/FloorCockpit";
import { AttendanceMuster } from "./features/attendance/AttendanceMuster";
import { ShiftMasterView } from "./features/roster/ShiftMasterView";
import { PunchStreamView } from "./features/punches/PunchStreamView";
import { OrgMasterView } from "./features/organization/OrgMasterView";
import { TraceDrawer } from "./features/attendance/TraceDrawer";
import { RegularizationModal } from "./features/live-floor/RegularizationModal";

export function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [currentTab, setCurrentTab] = useState("floor");
  const [searchTerm, setSearchTerm] = useState("");

  // Trace & Regularization modals
  const [activeTrace, setActiveTrace] = useState<any>(null);
  const [isRegularizationOpen, setIsRegularizationOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.me()
      .then(setMe)
      .catch((err: Error) => {
        setError(err.message);
        saveToken(null);
        setToken(null);
      });
  }, [token]);

  if (!token || !me) {
    return (
      <SignIn
        error={error}
        onSignedIn={(next) => {
          setError("");
          setToken(next);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col md:flex-row antialiased font-sans">
      {/* Sidebar Navigation */}
      <AdminSidebar currentTab={currentTab} onSelectTab={setCurrentTab} me={me} />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <TopHeader
          me={me}
          onSignOut={() => {
            saveToken(null);
            setToken(null);
            setMe(null);
          }}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        <main className="flex-1 p-6 space-y-6 max-w-7xl w-full mx-auto">
          {currentTab === "floor" && (
            <FloorCockpit
              me={me}
              onOpenTrace={setActiveTrace}
              onOpenRegularization={() => setIsRegularizationOpen(true)}
              searchTerm={searchTerm}
            />
          )}

          {currentTab === "attendance" && (
            <AttendanceMuster onOpenTrace={setActiveTrace} />
          )}

          {currentTab === "punches" && <PunchStreamView />}

          {currentTab === "roster" && <ShiftMasterView />}

          {currentTab === "org" && <OrgMasterView me={me} />}

          {currentTab === "iam" && (
            <section className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-poppins">
                IAM Roles & Granted Permissions
              </h3>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="font-bold text-slate-800 text-xs">Assigned Permission Keys:</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {me.permissions.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-700 font-bold"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      <TraceDrawer
        isOpen={Boolean(activeTrace)}
        onClose={() => setActiveTrace(null)}
        record={activeTrace}
      />

      <RegularizationModal
        isOpen={isRegularizationOpen}
        onClose={() => setIsRegularizationOpen(false)}
        onSubmit={(data) => {
          alert(`Supervisor punch recorded for ${data.punchTime} (${data.direction}). Attendance muster recomputed.`);
        }}
        employees={[
          { id: "emp-1029", full_name: "Sunil Varma", employee_code: "EMP-1029" },
          { id: "emp-1084", full_name: "Amitesh Das", employee_code: "EMP-1084" },
          { id: "emp-1102", full_name: "Kavita Murthy", employee_code: "EMP-1102" },
        ]}
      />
    </div>
  );
}

function SignIn({ error, onSignedIn }: { error: string; onSignedIn: (token: string) => void }) {
  const [email, setEmail] = useState("admin@northmill.example");
  const [password, setPassword] = useState("ChangeMe-Admin-1");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setLocalError("");
    try {
      const result = await api.login(email, password);
      saveToken(result.access_token);
      onSignedIn(result.access_token);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-[28px] border border-slate-100 shadow-xl max-w-md w-full p-8 space-y-5 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white font-black text-base flex items-center justify-center font-poppins shadow-xs">
            AP
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight font-poppins">APMS Enterprise</h1>
            <p className="text-[11px] text-slate-400 font-medium">Workforce Operating Platform</p>
          </div>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          Sign in to access live floor presence, shift rosters, and explainable attendance muster.
        </p>

        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email Address</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition"
              autoComplete="username"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition"
              autoComplete="current-password"
            />
          </div>
        </div>

        {(localError || error) && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
            {localError || error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || password.length < 8}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all"
        >
          {pending ? "Authenticating…" : "Sign In to Console"}
        </button>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>North Mill Tenant Seed</span>
          <span className="font-mono text-[10px]">ChangeMe-Admin-1</span>
        </div>
      </form>
    </main>
  );
}
