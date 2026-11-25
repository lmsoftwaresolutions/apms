import { FormEvent, useEffect, useState } from "react";
import { Plus, Building2, Trash2, Power, Pencil } from "lucide-react";
import { api, Branch } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { Field } from "../../components/common/Field";
import { LoadingRow } from "../../components/common/Spinner";

export function BranchesPage() {
  const { can } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create / Edit Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete Confirm State
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Deactivate Confirm State
  const [deactivateTarget, setDeactivateTarget] = useState<Branch | null>(null);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  async function loadBranches() {
    setLoading(true);
    try {
      const data = await api.branches();
      setBranches(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBranches();
  }, []);

  function openCreateModal() {
    setEditingBranch(null);
    setName("");
    setCode("");
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditModal(branch: Branch) {
    setEditingBranch(branch);
    setName(branch.name);
    setCode(branch.code);
    setFormError("");
    setIsFormOpen(true);
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setEditingBranch(null);
    setFormError("");
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || trimmedCode.length < 2) return;
    setFormSubmitting(true);
    setFormError("");
    try {
      if (editingBranch) {
        await api.updateBranch(editingBranch.id, { name: trimmedName, code: trimmedCode });
      } else {
        await api.createBranch(trimmedName, trimmedCode);
      }
      closeFormModal();
      setName("");
      setCode("");
      await loadBranches();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Failed to ${editingBranch ? "update" : "create"} branch`);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleActive(branch: Branch) {
    if (branch.is_active) {
      setDeactivateTarget(branch);
      return;
    }
    try {
      await api.updateBranch(branch.id, { is_active: true });
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update branch status");
    }
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setDeactivateSubmitting(true);
    try {
      await api.updateBranch(deactivateTarget.id, { is_active: false });
      setDeactivateTarget(null);
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate branch");
    } finally {
      setDeactivateSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await api.deleteBranch(deleteTarget.id);
      setDeleteTarget(null);
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete branch");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <div>
      {/* Page Header */}
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">Branches</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Configure and maintain physical branches, campuses, and operating locations.
          </p>
        </div>
        {can("org.branch.create") ? (
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={openCreateModal}
          >
            Add Branch
          </Button>
        ) : null}
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

      {/* Main Table or Empty State */}
      {!loading && branches.length === 0 ? (
        <EmptyState
          icon={<Building2 size={24} />}
          title="No branches configured"
          description="Branches represent work locations, offices, or facilities. Create your first branch to organize departments."
          action={
            can("org.branch.create")
              ? {
                  label: "Add Branch",
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
                <th>Branch Name</th>
                <th style={{ width: "120px" }}>Status</th>
                <th style={{ width: "260px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow cols={4} rows={4} />
              ) : (
                branches.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <code style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{b.code}</code>
                    </td>
                    <td style={{ fontWeight: 550 }}>{b.name}</td>
                    <td>
                      <Badge variant={b.is_active ? "success" : "neutral"}>
                        {b.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        {can("org.branch.update") ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Pencil size={14} />}
                              onClick={() => openEditModal(b)}
                              title="Edit branch"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Power size={14} />}
                              onClick={() => handleToggleActive(b)}
                            >
                              {b.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        ) : null}
                        {can("org.branch.delete") ? (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => setDeleteTarget(b)}
                            title="Delete branch"
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

      {/* Add / Edit Branch Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        title={editingBranch ? "Edit Branch" : "Add New Branch"}
        description={
          editingBranch
            ? `Update display name or code for ${editingBranch.name} (${editingBranch.code}).`
            : "Create an organizational branch code and location."
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
              disabled={!name.trim() || code.trim().length < 2}
            >
              {editingBranch ? "Save Changes" : "Create Branch"}
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

          <Field label="Branch Name" required help="e.g. Headquarters, Bangalore Tech Park">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Plant"
              required
            />
          </Field>

          <Field label="Branch Code" required help="Unique identifier, e.g. HQ, BLR-01">
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. HQ"
              required
            />
          </Field>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Branch"
        message={
          <>
            Are you sure you want to delete branch <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
            This operation cannot be undone and may fail if departments or employees are assigned to it.
          </>
        }
        confirmText="Delete Branch"
        loading={deleteSubmitting}
      />

      {/* Deactivate Branch Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Branch"
        message={
          <>
            Are you sure you want to deactivate <strong>{deactivateTarget?.name} ({deactivateTarget?.code})</strong>?
            New employees, departments, designations, and holidays cannot be added to a deactivated branch, while existing records stay preserved.
          </>
        }
        confirmText="Deactivate Branch"
        loading={deactivateSubmitting}
      />
    </div>
  );
}
