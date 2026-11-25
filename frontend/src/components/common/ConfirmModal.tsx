import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "primary" | "danger";
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertTriangle
            size={20}
            color={confirmVariant === "danger" ? "var(--color-danger)" : "var(--color-warning)"}
          />
          {title}
        </span>
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
        {message}
      </div>
    </Modal>
  );
}
