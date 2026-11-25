import { ReactNode } from "react";
import { Construction } from "lucide-react";
import { EmptyState } from "../../components/common/EmptyState";

export interface PlaceholderPageProps {
  title: string;
  moduleName: string;
  description?: string;
  icon?: ReactNode;
}

export function PlaceholderPage({
  title,
  moduleName,
  description = "Module coming soon in next milestone.",
  icon,
}: PlaceholderPageProps) {
  return (
    <div>
      <div className="card-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h2 className="card-title">{title}</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
            {moduleName} subsystem overview and management.
          </p>
        </div>
      </div>

      <EmptyState
        icon={icon || <Construction size={28} />}
        title={`${title} Coming Soon`}
        description={description}
      />
    </div>
  );
}
