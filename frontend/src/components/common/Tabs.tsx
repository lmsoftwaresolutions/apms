import { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = "" }: TabsProps) {
  return (
    <div className={`tabs-nav ${className}`.trim()} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab-btn ${isActive ? "active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon ? <span>{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {tab.count !== undefined ? (
              <span className="tab-count">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
