import React from "react";
import { X } from "lucide-react";

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: "present" | "halfday" | "absent" | "info" | "neutral" | "success" | "warning" | "danger" | "default";
  children: React.ReactNode;
  className?: string;
}) {
  const normVariant =
    variant === "success"
      ? "present"
      : variant === "warning"
      ? "halfday"
      : variant === "danger"
      ? "absent"
      : variant === "default"
      ? "neutral"
      : variant;
  return <span className={`badge ${normVariant} ${className}`}>{children}</span>;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 580,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="ghost small" type="button" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>{title}</h3>
          <button className="ghost small" type="button" onClick={onClose} aria-label="Close drawer">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={36} className="empty-state-icon" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div style={{ marginTop: "0.5rem" }}>{action}</div> : null}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: "0.5rem 0" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-row" style={{ display: "flex", gap: "1rem", padding: "0.85rem 1rem", borderBottom: "1px solid var(--border-default)" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton"
              style={{
                height: "16px",
                width: c === 0 ? "120px" : c === 1 ? "160px" : c === 2 ? "80px" : "100px",
                borderRadius: "4px",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Alert({
  variant = "danger",
  children,
  onDismiss,
}: {
  variant?: "danger" | "warning" | "info" | "success";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner ${variant}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span>{children}</span>
      </div>
      {onDismiss ? (
        <button type="button" className="ghost small" onClick={onDismiss} style={{ padding: "0 0.3rem" }}>✕</button>
      ) : null}
    </div>
  );
}
