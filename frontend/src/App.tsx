import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./context/AuthContext";
import { AppShell } from "./components/layouts/AppShell";
import { SignInPage } from "./modules/auth/SignInPage";
import { BranchesPage } from "./modules/org/BranchesPage";
import { DepartmentsPage } from "./modules/org/DepartmentsPage";
import { DesignationsPage } from "./modules/org/DesignationsPage";
import { RolesPage } from "./modules/iam/RolesPage";
import { UsersPage } from "./modules/iam/UsersPage";
import { PlaceholderPage } from "./modules/common/PlaceholderPage";

export function App() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<SignInPage />} />

      {/* Protected Layout Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/org/departments" replace />} />

          {/* Operations */}
          <Route
            path="/attendance"
            element={
              <PlaceholderPage
                title="Attendance Rollup"
                moduleName="Operations"
                description="Daily session pairing, worked duration, and anomaly resolution coming soon."
              />
            }
          />
          <Route
            path="/punches"
            element={
              <PlaceholderPage
                title="Live Punches"
                moduleName="Operations"
                description="Biometric device raw envelopes, webhook ingest, and debounced punch timeline coming soon."
              />
            }
          />
          <Route
            path="/muster"
            element={
              <PlaceholderPage
                title="Muster Roll"
                moduleName="Operations"
                description="Form XX statutory muster roll, monthly attendance rollups, and audit logs coming soon."
              />
            }
          />

          {/* Scheduling */}
          <Route
            path="/shifts"
            element={
              <PlaceholderPage
                title="Shift Management"
                moduleName="Scheduling"
                description="Shift templates, split sessions (N65 gap exclusion), and rotating schedules coming soon."
              />
            }
          />
          <Route
            path="/roster"
            element={
              <PlaceholderPage
                title="Roster Matrix"
                moduleName="Scheduling"
                description="Dated employee shift assignment grid, bulk rota publish, and swap workflows coming soon."
              />
            }
          />
          <Route
            path="/policies"
            element={
              <PlaceholderPage
                title="Attendance Policies"
                moduleName="Scheduling"
                description="Grace periods, late-coming penalty slabs, and half-day thresholds coming soon."
              />
            }
          />

          {/* Approvals */}
          <Route
            path="/overtime"
            element={
              <PlaceholderPage
                title="Overtime Requests"
                moduleName="Approvals"
                description="Pre-shift & post-shift overtime approval workflows and compensatory off banking coming soon."
              />
            }
          />
          <Route
            path="/requests"
            element={
              <PlaceholderPage
                title="Leaves & Regularization"
                moduleName="Approvals"
                description="Double-entry leave ledger, sandwich rule validation, and punch regularization requests coming soon."
              />
            }
          />

          {/* People & Organization */}
          <Route
            path="/employees"
            element={
              <PlaceholderPage
                title="Employees Directory"
                moduleName="People"
                description="Worker master vault, statutory PAN/Aadhaar/UAN profiles, and onboarding coming soon."
              />
            }
          />
          <Route path="/org/branches" element={<Navigate to="/admin/branches" replace />} />
          <Route path="/org/departments" element={<DepartmentsPage />} />
          <Route path="/org/designations" element={<DesignationsPage />} />

          {/* Administration & IAM */}
          <Route path="/admin/branches" element={<BranchesPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/org/departments" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
