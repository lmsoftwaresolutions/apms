import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    variant?: "primary" | "secondary";
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <div className="empty-state-icon">
        {icon || <Inbox size={24} />}
      </div>
      <h4 className="empty-state-title">{title}</h4>
      {description ? <p className="empty-state-desc">{description}</p> : null}
      {action ? (
        <Button
          variant={action.variant || "primary"}
          onClick={action.onClick}
          icon={action.icon}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
