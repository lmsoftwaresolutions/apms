import React, { useEffect, useState } from "react";
import { Plus, Building2, Layers, Briefcase, Trash2, Edit } from "lucide-react";
import { api, Branch, Department } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Badge, Drawer, EmptyState } from "../../components/common/UIComponents";

export const PRESET_DESIGNATIONS = [
  "Senior Software Engineer",
  "Software Engineer",
  "QA Engineer",
  "System Architect",
  "Shift Supervisor",
  "Operations Lead",
  "HR Manager",
  "HR Associate",
  "Finance Analyst",
  "Plant Supervisor",
  "Maintenance Technician",
];

export function OrganizationPage() {
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState<"departments" | "branches" | "designations">("departments");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Branch Modal/Drawer State
  const [isBranchDrawerOpen, setIsBranchDrawerOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");

  // Department Modal/Drawer State
  const [isDeptDrawerOpen, setIsDeptDrawerOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [deptBranchId, setDeptBranchId] = useState("");
  const [deptParentId, setDeptParentId] = useState("");

  async function loadBranches() {
    try {
      const b = await api.branches();
      setBranches(b);
      if (!selectedBranchId && b.length > 0) {
        setSelectedBranchId(b[0].id);
      }
      return b;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
      return [];
    }
  }

  async function loadDepartments(branchId?: string) {
    try {
      const d = await api.departments(branchId || undefined);
      setDepartments(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const b = await loadBranches();
      if (b.length > 0) {
        await loadDepartments(b[0].id);
      }
      setLoading(false);
    }
    void init();
  }, []);

  const handleBranchFilterChange = async (bId: string) => {
    setSelectedBranchId(bId);
    setLoading(true);
    await loadDepartments(bId);
    setLoading(false);
  };

  // Branch CRUD
  const openCreateBranch = () => {
    setEditingBranch(null);
    setBranchName("");
    setBranchCode("");
    setIsBranchDrawerOpen(true);
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchCode(b.code);
    setIsBranchDrawerOpen(true);
  };

  const saveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await api.updateBranch(editingBranch.id, { name: branchName, code: branchCode.toUpperCase() });
      } else {
        await api.createBranch(branchName, branchCode.toUpperCase());
      }
      setIsBranchDrawerOpen(false);
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branch");
    }
  };

  const deleteBranch = async (id: string) => {
    if (!confirm("Delete branch? This will fail if departments or employees are bound to it.")) return;
    try {
      await api.deleteBranch(id);
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete branch");
    }
  };

  // Department CRUD
  const openCreateDept = () => {
    setEditingDept(null);
    setDeptName("");
    setDeptCode("");
    setDeptBranchId(selectedBranchId || branches[0]?.id || "");
    setDeptParentId("");
    setIsDeptDrawerOpen(true);
  };

  const openEditDept = (d: Department) => {
    setEditingDept(d);
    setDeptName(d.name);
    setDeptCode(d.code);
    setDeptBranchId(d.branch_id);
    setDeptParentId(d.parent_dept_id || "");
    setIsDeptDrawerOpen(true);
  };

  const saveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, {
          name: deptName,
          code: deptCode.toUpperCase(),
          branch_id: deptBranchId,
          parent_dept_id: deptParentId || null,
        });
      } else {
        await api.createDepartment(deptBranchId, deptName, deptCode.toUpperCase(), deptParentId || null);
      }
      setIsDeptDrawerOpen(false);
      await loadDepartments(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save department");
    }
  };

  const deleteDepartment = async (id: string) => {
    if (!confirm("Delete department? This will fail if employees or child departments are bound to it.")) return;
    try {
      await api.deleteDepartment(id);
      await loadDepartments(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete department");
    }
  };

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2>Organization Hierarchy</h2>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Configure branches, hierarchical departments, and standardized designations.
          </p>
        </div>

        <div className="flex gap-2">
          {activeTab === "departments" && can("org.department.create") ? (
            <button className="primary" type="button" onClick={openCreateDept} disabled={branches.length === 0}>
              <Plus size={16} /> Add Department
            </button>
          ) : null}

          {activeTab === "branches" && can("org.branch.create") ? (
            <button className="primary" type="button" onClick={openCreateBranch}>
              <Plus size={16} /> Add Branch
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div style={{ padding: "0.6rem 0.8rem", background: "var(--danger-bg)", color: "var(--danger-fg)", borderRadius: "4px", fontSize: "0.82rem" }}>
          {error}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2" style={{ borderBottom: "1px solid var(--border-default)", paddingBottom: "0.5rem" }}>
        <button
          className={activeTab === "departments" ? "primary small" : "ghost small"}
          type="button"
          onClick={() => setActiveTab("departments")}
        >
          <Layers size={14} /> Departments ({departments.length})
        </button>
        <button
          className={activeTab === "branches" ? "primary small" : "ghost small"}
          type="button"
          onClick={() => setActiveTab("branches")}
        >
          <Building2 size={14} /> Branches ({branches.length})
        </button>
        <button
          className={activeTab === "designations" ? "primary small" : "ghost small"}
          type="button"
          onClick={() => setActiveTab("designations")}
        >
          <Briefcase size={14} /> Designation Presets
        </button>
      </div>

      {/* Tab: Departments */}
      {activeTab === "departments" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="panel" style={{ padding: "0.75rem 1rem", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div className="flex items-center gap-2">
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", margin: 0 }}>
                <span>Filter by Branch:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => handleBranchFilterChange(e.target.value)}
                  style={{ width: "220px" }}
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="panel" style={{ padding: 0 }}>
            {departments.length === 0 && !loading ? (
              <EmptyState
                icon={Layers}
                title="No departments found"
                description="No departments exist for the selected branch. Add a department to organize employees."
                action={
                  can("org.department.create") ? (
                    <button className="primary small" type="button" onClick={openCreateDept}>
                      <Plus size={14} /> Create Department
                    </button>
                  ) : null
                }
              />
            ) : (
              <div className="table-container" style={{ border: "none" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dept Code</th>
                      <th>Department Name</th>
                      <th>Branch</th>
                      <th>Parent Department</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept) => (
                      <tr key={dept.id}>
                        <td style={{ fontWeight: 600 }}>{dept.code}</td>
                        <td>{dept.name}</td>
                        <td>{branchNameById.get(dept.branch_id) || "—"}</td>
                        <td>{dept.parent_dept_id ? deptNameById.get(dept.parent_dept_id) || "—" : <span className="text-muted">Root</span>}</td>
                        <td>
                          <Badge variant={dept.is_active ? "present" : "neutral"}>
                            {dept.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="flex items-center" style={{ justifyContent: "flex-end", gap: "0.4rem" }}>
                            {can("org.department.update") ? (
                              <button className="ghost small" type="button" onClick={() => openEditDept(dept)}>
                                <Edit size={14} /> Edit
                              </button>
                            ) : null}
                            {can("org.department.delete") ? (
                              <button className="danger small" type="button" onClick={() => deleteDepartment(dept.id)}>
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Tab: Branches */}
      {activeTab === "branches" ? (
        <div className="panel" style={{ padding: 0 }}>
          {branches.length === 0 && !loading ? (
            <EmptyState
              icon={Building2}
              title="No branches yet"
              description="Create your first organization branch or operating site."
              action={
                can("org.branch.create") ? (
                  <button className="primary small" type="button" onClick={openCreateBranch}>
                    <Plus size={14} /> Add Branch
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container" style={{ border: "none" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Branch Code</th>
                    <th>Branch Name</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr key={branch.id}>
                      <td style={{ fontWeight: 600 }}>{branch.code}</td>
                      <td>{branch.name}</td>
                      <td>
                        <Badge variant={branch.is_active ? "present" : "neutral"}>
                          {branch.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="flex items-center" style={{ justifyContent: "flex-end", gap: "0.4rem" }}>
                          {can("org.branch.update") ? (
                            <button className="ghost small" type="button" onClick={() => openEditBranch(branch)}>
                              <Edit size={14} /> Edit
                            </button>
                          ) : null}
                          {can("org.branch.delete") ? (
                            <button className="danger small" type="button" onClick={() => deleteBranch(branch.id)}>
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Tab: Designation Presets */}
      {activeTab === "designations" ? (
        <div className="panel">
          <div className="panel-header">
            <h3>Standardized Designation Catalog</h3>
          </div>
          <p className="text-secondary" style={{ fontSize: "0.82rem" }}>
            Designations are bound directly to employee records and used across payroll, shift assignments, and reports.
            The catalog below provides standard job title suggestions during employee creation.
          </p>
          <div className="flex gap-2" style={{ flexWrap: "wrap", marginTop: "0.5rem" }}>
            {PRESET_DESIGNATIONS.map((desig) => (
              <Badge key={desig} variant="info">
                {desig}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {/* Branch Drawer */}
      <Drawer
        isOpen={isBranchDrawerOpen}
        onClose={() => setIsBranchDrawerOpen(false)}
        title={editingBranch ? "Edit Branch" : "Add Branch"}
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsBranchDrawerOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={!branchName || branchCode.length < 2}
              onClick={saveBranch}
            >
              {editingBranch ? "Save Changes" : "Create Branch"}
            </button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={saveBranch}>
          <div className="form-group">
            <label>Branch Code</label>
            <input
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
              placeholder="e.g. BLR01"
              required
            />
          </div>
          <div className="form-group">
            <label>Branch Name</label>
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g. Bangalore Headquarters"
              required
            />
          </div>
        </form>
      </Drawer>

      {/* Department Drawer */}
      <Drawer
        isOpen={isDeptDrawerOpen}
        onClose={() => setIsDeptDrawerOpen(false)}
        title={editingDept ? "Edit Department" : "Add Department"}
        footer={
          <>
            <button className="ghost small" type="button" onClick={() => setIsDeptDrawerOpen(false)}>
              Cancel
            </button>
            <button
              className="primary small"
              type="button"
              disabled={!deptName || deptCode.length < 2 || !deptBranchId}
              onClick={saveDepartment}
            >
              {editingDept ? "Save Changes" : "Create Department"}
            </button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={saveDepartment}>
          <div className="form-group">
            <label>Branch</label>
            <select
              value={deptBranchId}
              onChange={(e) => setDeptBranchId(e.target.value)}
              required
            >
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Department Code</label>
            <input
              value={deptCode}
              onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
              placeholder="e.g. ENG"
              required
            />
          </div>

          <div className="form-group">
            <label>Department Name</label>
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="e.g. Product Engineering"
              required
            />
          </div>

          <div className="form-group">
            <label>Parent Department (Optional)</label>
            <select
              value={deptParentId}
              onChange={(e) => setDeptParentId(e.target.value)}
            >
              <option value="">None (Top-Level)</option>
              {departments
                .filter((d) => (!editingDept || d.id !== editingDept.id) && d.branch_id === deptBranchId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
            </select>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
