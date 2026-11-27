import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Briefcase, Trash2, Power, ArrowRight, Pencil } from "lucide-react";
import { api, Branch, Department, Designation } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { Field } from "../../components/common/Field";
import { LoadingRow } from "../../components/common/Spinner";

export function DesignationsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // Add / Edit Designation Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null);
  const [formDeptId, setFormDeptId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete & Deactivate Modals
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Designation | null>(null);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [branchList, deptList, desigList] = await Promise.all([
        api.branches(),
        api.departments(),
        api.designations(),
      ]);
      setBranches(branchList);
      setDepartments(deptList);
      setDesignations(desigList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load designations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const activeDepartments = departments.filter((d) => d.is_active);
  const severalBranches = branches.length > 1;

  function departmentLabel(departmentId: string): string {
    const department = departmentById.get(departmentId);
    if (!department) return departmentId.slice(0, 8);
    const branch = branchNameById.get(department.branch_id);
    const title = `${department.name} (${department.code})`;
    return severalBranches && branch ? `${title} — ${branch}` : title;
  }

  const needle = query.trim().toLowerCase();
  const visibleDesignations = needle
    ? designations.filter((desig) => {
        const haystack = [desig.name, desig.code, desig.description || "", departmentLabel(desig.department_id)]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
    : designations;

  function openCreateModal() {
    setEditingDesig(null);
    setFormDeptId(activeDepartments[0]?.id || "");
    setName("");
    setCode("");
    setDescription("");
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditModal(desig: Designation) {
    setEditingDesig(desig);
    setFormDeptId(desig.department_id);
    setName(desig.name);
    setCode(desig.code);
    setDescription(desig.description || "");
    setFormError("");
    setIsFormOpen(true);
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setEditingDesig(null);
    setFormDeptId("");
    setFormError("");
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedDesc = description.trim();
    if (!trimmedName || trimmedCode.length < 2) return;
    if (!editingDesig && !formDeptId) return;

    setFormSubmitting(true);
    setFormError("");
    try {
      if (editingDesig) {
        await api.updateDesignation(editingDesig.id, {
          name: trimmedName,
          code: trimmedCode,
          description: trimmedDesc || null,
        });
      } else {
        await api.createDesignation(formDeptId, trimmedName, trimmedCode, trimmedDesc || null);
      }
      closeFormModal();
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Failed to ${editingDesig ? "update" : "create"} designation`);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleActive(desig: Designation) {
    if (desig.is_active) {
      setDeactivateTarget(desig);
      return;
    }
    try {
      await api.updateDesignation(desig.id, { is_active: true });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update designation status");
    }
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setDeactivateSubmitting(true);
    try {
      await api.updateDesignation(deactivateTarget.id, { is_active: false });
      setDeactivateTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate designation");
    } finally {
      setDeactivateSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await api.deleteDesignation(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete designation");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Designations</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Job positions, titles, and roles configured per department.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {designations.length > 0 ? (
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, code, or department"
              aria-label="Search designations"
              style={{ width: "16rem", maxWidth: "100%" }}
            />
          ) : null}
          {can("org.designation.create") ? (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={openCreateModal}
              disabled={activeDepartments.length === 0}
              title={activeDepartments.length === 0 ? "Create an active department first" : undefined}
            >
              Add Designation
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

      {departments.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={24} />}
          title="No departments found"
          description="Designations belong to a department. Create a department first to begin adding job positions."
          action={
            can("org.department.create")
              ? {
                  label: "Create Department",
                  onClick: () => navigate("/org/departments"),
                  icon: <ArrowRight size={16} />,
                  variant: "primary",
                }
              : undefined
          }
        />
      ) : !loading && designations.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={24} />}
          title="No designations found"
          description="Add job designations (e.g., Spinning Operator, Line Supervisor, QA Inspector)."
          action={
            can("org.designation.create") && activeDepartments.length > 0
              ? {
                  label: "Add Designation",
                  onClick: openCreateModal,
                  icon: <Plus size={16} />,
                }
              : undefined
          }
        />
      ) : (
        <div className="table-container" style={{ marginBottom: "2rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "120px" }}>Code</th>
                <th>Designation Title</th>
                <th>Department</th>
                <th>Description</th>
                <th style={{ width: "120px" }}>Status</th>
                <th style={{ width: "260px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow cols={6} rows={4} />
              ) : visibleDesignations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                    No designations match “{query.trim()}”.
                  </td>
                </tr>
              ) : (
                visibleDesignations.map((desig) => (
                  <tr key={desig.id}>
                    <td>
                      <code style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{desig.code}</code>
                    </td>
                    <td style={{ fontWeight: 550 }}>{desig.name}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{departmentLabel(desig.department_id)}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      {desig.description || "—"}
                    </td>
                    <td>
                      <Badge variant={desig.is_active ? "success" : "neutral"}>
                        {desig.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        {can("org.designation.update") ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Pencil size={14} />}
                              onClick={() => openEditModal(desig)}
                              title="Edit designation"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Power size={14} />}
                              onClick={() => handleToggleActive(desig)}
                            >
                              {desig.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        ) : null}
                        {can("org.designation.delete") ? (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => setDeleteTarget(desig)}
                            title="Delete designation"
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

      {/* Add / Edit Designation Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        title={editingDesig ? "Edit Designation" : "Add Designation"}
        description={
          editingDesig
            ? `Update title, code, or description for ${editingDesig.name} in ${departmentLabel(editingDesig.department_id)}.`
            : "Add a new job title to a department."
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
              disabled={!name.trim() || code.trim().length < 2 || (!editingDesig && !formDeptId)}
            >
              {editingDesig ? "Save Changes" : "Create Designation"}
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

          {!editingDesig ? (
            <Field label="Department" required help="Select the department this designation belongs to">
              <select
                className="select"
                value={formDeptId}
                onChange={(e) => setFormDeptId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a department
                </option>
                {activeDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {departmentLabel(dept.id)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Department">
              <input
                className="input"
                value={departmentLabel(editingDesig.department_id)}
                disabled
                readOnly
              />
            </Field>
          )}

          <Field label="Designation Title" required help="e.g. Spinning Operator, Quality Assurance Inspector">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Technician"
              required
            />
          </Field>

          <Field label="Designation Code" required help="Unique identifier, e.g. TECH-SR">
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. OPR-SPIN"
              required
            />
          </Field>

          <Field label="Description (Optional)" help="Scope of duties, responsibility level">
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Responsible for first-line loom operation"
            />
          </Field>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Designation"
        message={
          <>
            Are you sure you want to delete designation <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
            This will fail if any employees are currently assigned to this position.
          </>
        }
        confirmText="Delete Designation"
        loading={deleteSubmitting}
      />

      {/* Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Designation"
        message={
          <>
            Are you sure you want to deactivate <strong>{deactivateTarget?.name} ({deactivateTarget?.code})</strong>?
            Deactivated designations cannot be assigned to new employees.
          </>
        }
        confirmText="Deactivate Designation"
        loading={deactivateSubmitting}
      />
    </div>
  );
}
