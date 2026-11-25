import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("apms.sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("apms.sidebar_collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleMobile = () => setMobileOpen((prev) => !prev);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="app-sidebar-backdrop"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />
      <div className="app-main">
        <TopBar onOpenMobileSidebar={toggleMobile} />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
