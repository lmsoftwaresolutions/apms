import { FormEvent, useEffect, useState } from "react";
import { Plus, Network, Trash2, Power, Filter } from "lucide-react";
import { api, Branch, Department } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { Field } from "../../components/common/Field";
import { LoadingRow } from "../../components/common/Spinner";

export function DepartmentsPage() {
  const { can } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add Department Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [modalBranchId, setModalBranchId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  // Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  async function loadData(targetBranchId?: string) {
    setLoading(true);
    try {
      const branchList = await api.branches();
      setBranches(branchList);
      const activeBranchId =
        targetBranchId !== undefined
          ? targetBranchId
          : selectedBranchId || branchList[0]?.id || "";
      setSelectedBranchId(activeBranchId);
      if (!modalBranchId && activeBranchId) {
        setModalBranchId(activeBranchId);
      }

      const deptList = await api.departments(activeBranchId || undefined);
      setDepartments(deptList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(selectedBranchId || undefined);
  }, [selectedBranchId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const branchIdToUse = modalBranchId || selectedBranchId;
    if (!branchIdToUse || !name || code.length < 2) return;
    setCreateSubmitting(true);
    setCreateError("");
    try {
      await api.createDepartment(branchIdToUse, name, code.toUpperCase(), parentId || null);
      setName("");
      setCode("");
      setParentId("");
      setIsCreateOpen(false);
      await loadData(branchIdToUse);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create department");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleToggleActive(dept: Department) {
    try {
      await api.updateDepartment(dept.id, { is_active: !dept.is_active });
      await loadData(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update department status");
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await api.deleteDepartment(deleteTarget.id);
      setDeleteTarget(null);
      await loadData(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete department");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const departmentById = new Map(departments.map((dept) => [dept.id, dept]));

  function parentLabel(parentDeptId: string | null | undefined) {
    if (!parentDeptId) return "—";
    const parent = departmentById.get(parentDeptId);
    return parent ? `${parent.name} (${parent.code})` : parentDeptId.slice(0, 8);
  }

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Departments</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Structure departmental hierarchies, divisions, and reporting units per branch.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {branches.length > 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Filter size={16} color="var(--text-muted)" />
              <select
                className="select"
                style={{ width: "auto", minWidth: "180px", padding: "0.45rem 0.75rem" }}
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}){!b.is_active ? " (Inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {can("org.department.create") ? (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => {
                const activeBranch = branches.find((b) => b.id === selectedBranchId && b.is_active);
                const firstActive = branches.find((b) => b.is_active);
                setModalBranchId(activeBranch ? activeBranch.id : firstActive?.id || "");
                setIsCreateOpen(true);
              }}
              disabled={branches.filter((b) => b.is_active).length === 0}
            >
              Add Department
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-danger-bg)",
            color: "var(--color-danger-fg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {branches.length === 0 ? (
        <EmptyState
          icon={<Network size={24} />}
          title="No branches available"
          description="Departments belong to a branch. Create a branch first before adding departments."
        />
      ) : !loading && departments.length === 0 ? (
        <EmptyState
          icon={<Network size={24} />}
          title="No departments found for this branch"
          description="Add divisions or operational departments (e.g., Spinning, Weaving, Quality) to this branch."
          action={
            can("org.department.create")
              ? {
                  label: "Add Department",
                  onClick: () => {
                    setModalBranchId(selectedBranchId);
                    setIsCreateOpen(true);
                  },
                  icon: <Plus size={16} />,
                }
              : undefined
          }
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "120px" }}>Code</th>
                <th>Department Name</th>
                {branches.length > 1 ? <th>Branch</th> : null}
                <th>Parent Unit</th>
                <th style={{ width: "120px" }}>Status</th>
                <th style={{ width: "200px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow cols={branches.length > 1 ? 6 : 5} rows={4} />
              ) : (
                departments.map((dept) => (
                  <tr key={dept.id}>
                    <td>
                      <code style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{dept.code}</code>
                    </td>
                    <td style={{ fontWeight: 550 }}>{dept.name}</td>
                    {branches.length > 1 ? (
                      <td style={{ color: "var(--text-secondary)" }}>
                        {branchNameById.get(dept.branch_id) || dept.branch_id.slice(0, 8)}
                      </td>
                    ) : null}
                    <td style={{ color: "var(--text-secondary)" }}>{parentLabel(dept.parent_dept_id)}</td>
                    <td>
                      <Badge variant={dept.is_active ? "success" : "neutral"}>
                        {dept.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        {can("org.department.update") ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Power size={14} />}
                            onClick={() => handleToggleActive(dept)}
                          >
                            {dept.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        ) : null}
                        {can("org.department.delete") ? (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => setDeleteTarget(dept)}
                            title="Delete department"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Department Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateError("");
        }}
        title="Add Department"
        description="Create a department within a selected branch."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateError("");
              }}
              disabled={createSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => handleCreate(e as unknown as FormEvent)}
              loading={createSubmitting}
              disabled={!name.trim() || code.trim().length < 2 || !modalBranchId}
            >
              Create Department
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {createError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {createError}
            </div>
          ) : null}

          {branches.length > 1 ? (
            <Field label="Branch" required>
              <select
                className="select"
                value={modalBranchId}
                onChange={(e) => setModalBranchId(e.target.value)}
                required
              >
                {branches.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Department Name" required help="e.g. Operations, Human Resources, Spinning">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Floor"
              required
            />
          </Field>

          <Field label="Department Code" required help="Unique identifier, e.g. DEPT-PROD">
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. PROD"
              required
            />
          </Field>

          <Field label="Parent Department (Optional)" help="Select a parent unit to establish organizational hierarchy">
            <select
              className="select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None (Top-level)</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} ({dept.code})
                </option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Department"
        message={
          <>
            Are you sure you want to delete department <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
            This will fail if any child departments, designations, or employees are linked to it.
          </>
        }
        confirmText="Delete Department"
        loading={deleteSubmitting}
      />
    </div>
  );
}
