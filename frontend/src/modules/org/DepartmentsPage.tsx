import { FormEvent, useEffect, useState } from "react";
import { Plus, Network, Trash2, Power, Filter, Pencil } from "lucide-react";
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
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add / Edit Department Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [modalBranchId, setModalBranchId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete & Deactivate Modals
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Department | null>(null);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  async function loadData(targetBranchId?: string) {
    setLoading(true);
    try {
      const [branchList, allDeptList] = await Promise.all([api.branches(), api.departments()]);
      setBranches(branchList);
      setAllDepartments(allDeptList);
      const defaultBranch = branchList.find((b) => b.is_active) || branchList[0];
      const activeBranchId =
        targetBranchId !== undefined
          ? targetBranchId
          : selectedBranchId || defaultBranch?.id || "";
      setSelectedBranchId(activeBranchId);
      if (!modalBranchId && activeBranchId) {
        const activeModalBranch = branchList.find((b) => b.id === activeBranchId && b.is_active) || branchList.find((b) => b.is_active);
        setModalBranchId(activeModalBranch?.id || "");
      }
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

  const departments = allDepartments.filter((d) => !selectedBranchId || d.branch_id === selectedBranchId);
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const effectiveModalBranchId = modalBranchId || branches.find((b) => b.is_active)?.id || "";

  const descendantIds = new Set<string>();
  if (editingDept) {
    const queue = [editingDept.id];
    while (queue.length > 0) {
      const currId = queue.shift()!;
      for (const d of allDepartments) {
        if (d.parent_dept_id === currId && !descendantIds.has(d.id) && d.id !== editingDept.id) {
          descendantIds.add(d.id);
          queue.push(d.id);
        }
      }
    }
  }

  const editingHasChildren = Boolean(editingDept && descendantIds.size > 0);
  const modalBranchCandidates = branches.filter((b) => b.is_active || b.id === editingDept?.branch_id);
  const modalParentCandidates = allDepartments.filter(
    (d) =>
      d.branch_id === effectiveModalBranchId &&
      d.id !== editingDept?.id &&
      !descendantIds.has(d.id) &&
      (d.is_active || d.id === editingDept?.parent_dept_id),
  );

  function openCreateModal() {
    const activeSelected = branches.find((b) => b.id === selectedBranchId && b.is_active);
    const firstActive = branches.find((b) => b.is_active);
    setEditingDept(null);
    setModalBranchId(activeSelected ? activeSelected.id : firstActive?.id || "");
    setName("");
    setCode("");
    setParentId("");
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditModal(dept: Department) {
    setEditingDept(dept);
    setModalBranchId(dept.branch_id);
    setName(dept.name);
    setCode(dept.code);
    setParentId(dept.parent_dept_id || "");
    setFormError("");
    setIsFormOpen(true);
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setEditingDept(null);
    setFormError("");
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const branchIdToUse = effectiveModalBranchId;
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!branchIdToUse || !trimmedName || trimmedCode.length < 2) return;
    setFormSubmitting(true);
    setFormError("");
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, {
          branch_id: branchIdToUse,
          name: trimmedName,
          code: trimmedCode,
          parent_dept_id: parentId || null,
        });
      } else {
        await api.createDepartment(branchIdToUse, trimmedName, trimmedCode, parentId || null);
      }
      setName("");
      setCode("");
      setParentId("");
      closeFormModal();
      await loadData(branchIdToUse);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Failed to ${editingDept ? "update" : "create"} department`);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleActive(dept: Department) {
    if (dept.is_active) {
      setDeactivateTarget(dept);
      return;
    }
    try {
      await api.updateDepartment(dept.id, { is_active: true });
      await loadData(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update department status");
    }
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setDeactivateSubmitting(true);
    try {
      await api.updateDepartment(deactivateTarget.id, { is_active: false });
      setDeactivateTarget(null);
      await loadData(selectedBranchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate department");
    } finally {
      setDeactivateSubmitting(false);
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
  const departmentById = new Map(allDepartments.map((dept) => [dept.id, dept]));

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
              onClick={openCreateModal}
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
          description={
            selectedBranch && !selectedBranch.is_active
              ? "This branch is deactivated. Switch to an active branch or re-activate this location before adding departments."
              : "Add divisions or operational departments (e.g., Spinning, Weaving, Quality) to this branch."
          }
          action={
            can("org.department.create") && branches.some((b) => b.is_active)
              ? {
                  label: "Add Department",
                  onClick: openCreateModal,
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
                <th style={{ width: "260px", textAlign: "right" }}>Actions</th>
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
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Pencil size={14} />}
                              onClick={() => openEditModal(dept)}
                              title="Edit department"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Power size={14} />}
                              onClick={() => handleToggleActive(dept)}
                            >
                              {dept.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </>
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

      {/* Add / Edit Department Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        title={editingDept ? "Edit Department" : "Add Department"}
        description={
          editingDept
            ? `Update details, branch assignment, or parent hierarchy for ${editingDept.name} (${editingDept.code}).`
            : "Create a department within a selected branch."
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeFormModal} disabled={formSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => handleFormSubmit(e as unknown as FormEvent)}
              loading={formSubmitting}
              disabled={!name.trim() || code.trim().length < 2 || !effectiveModalBranchId}
            >
              {editingDept ? "Save Changes" : "Create Department"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {formError ? (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger-fg)",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              {formError}
            </div>
          ) : null}

          {branches.length > 1 || editingDept ? (
            <Field
              label="Branch"
              required
              help={
                editingHasChildren
                  ? "Re-parent sub-departments before moving this department to another branch."
                  : undefined
              }
            >
              <select
                className="select"
                value={effectiveModalBranchId}
                onChange={(e) => {
                  setModalBranchId(e.target.value);
                  setParentId("");
                }}
                disabled={editingHasChildren}
                required
              >
                {modalBranchCandidates.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}){!b.is_active ? " (Inactive)" : ""}
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

          <Field label="Parent Department (Optional)" help="Select an active parent unit in the chosen branch">
            <select
              className="select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None (Top-level)</option>
              {modalParentCandidates.map((dept) => (
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

      {/* Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Department"
        message={
          <>
            Are you sure you want to deactivate <strong>{deactivateTarget?.name} ({deactivateTarget?.code})</strong>?
            New employees, designations, and sub-departments cannot be added to a deactivated department.
          </>
        }
        confirmText="Deactivate Department"
        loading={deactivateSubmitting}
      />
    </div>
  );
}
