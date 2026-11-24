import React, { useEffect, useState } from "react";
import { api, Branch, Department, Designation, Me } from "../../api";
import { Building2, Plus, Trash2, Power } from "lucide-react";

interface OrgMasterViewProps {
  me: Me;
}

export const OrgMasterView: React.FC<OrgMasterViewProps> = ({ me }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");

  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCode, setNewBranchCode] = useState("");

  const can = (perm: string) => me.permissions.includes(perm);

  const loadData = async () => {
    try {
      const bList = await api.branches();
      setBranches(bList);
      const bId = selectedBranchId || bList[0]?.id || "";
      setSelectedBranchId(bId);

      const dList = await api.departments(bId || undefined);
      setDepartments(dList);
      const deptId = selectedDeptId || dList[0]?.id || "";
      setSelectedDeptId(deptId);

      if (deptId) {
        const desigList = await api.designations(deptId);
        setDesignations(desigList);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId, selectedDeptId]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName || !newBranchCode) return;
    await api.createBranch(newBranchName, newBranchCode.toUpperCase());
    setNewBranchName("");
    setNewBranchCode("");
    loadData();
  };

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Branches & Hierarchy */}
        <div className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-blue-600"></div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-poppins">
                Branches & Units
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-400">{branches.length} branches</span>
          </div>

          <div className="space-y-2">
            {branches.map((b) => (
              <div
                key={b.id}
                onClick={() => setSelectedBranchId(b.id)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                  selectedBranchId === b.id
                    ? "bg-blue-50/50 border-blue-300 shadow-xs"
                    : "bg-slate-50 border-slate-200/80 hover:bg-slate-100/50"
                }`}
              >
                <div>
                  <div className="font-bold text-slate-800 text-xs">{b.name}</div>
                  <div className="text-[10px] font-mono font-bold text-slate-400">{b.code}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                      b.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {b.is_active ? "Active" : "Inactive"}
                  </span>
                  {can("org.branch.delete") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        api.deleteBranch(b.id).then(loadData);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {can("org.branch.create") && (
            <form onSubmit={handleCreateBranch} className="pt-3 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  placeholder="Branch Name (e.g. South Mill)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                />
                <input
                  placeholder="Code (e.g. SM-01)"
                  value={newBranchCode}
                  onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={!newBranchName || newBranchCode.length < 2}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                + Add Branch
              </button>
            </form>
          )}
        </div>

        {/* Departments & Designations */}
        <div className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-purple-600"></div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-poppins">
                Departments & Designations
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-400">{departments.length} depts</span>
          </div>

          <div className="space-y-3">
            <div className="text-xs space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Branch</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  onClick={() => setSelectedDeptId(dept.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between ${
                    selectedDeptId === dept.id
                      ? "bg-purple-50/50 border-purple-300"
                      : "bg-slate-50 border-slate-200/80"
                  }`}
                >
                  <div>
                    <span className="font-bold text-slate-800">{dept.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 ml-2">({dept.code})</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {dept.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>

            {designations.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Designations in selected department:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {designations.map((desig) => (
                    <span
                      key={desig.id}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700"
                    >
                      {desig.name} ({desig.code})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  );
};

