import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./context/AuthContext";
import { AppShell } from "./components/layouts/AppShell";
import { SignInPage } from "./modules/auth/SignInPage";
import { BranchesPage } from "./modules/org/BranchesPage";
import { DepartmentsPage } from "./modules/org/DepartmentsPage";
import { DesignationsPage } from "./modules/org/DesignationsPage";
import { RolesPage } from "./modules/iam/RolesPage";
import { UsersPage } from "./modules/iam/UsersPage";
import { EmployeesPage } from "./modules/employees/EmployeesPage";
import { PendingActionsPage } from "./modules/actions/PendingActionsPage";
import { ShiftTemplatesPage } from "./modules/shifts/ShiftTemplatesPage";
import { RosterMatrixPage } from "./modules/roster/RosterMatrixPage";
import { PunchStreamPage } from "./modules/punches/PunchStreamPage";
import { DailyAttendancePage } from "./modules/attendance/DailyAttendancePage";
import { MusterRollPage } from "./modules/muster/MusterRollPage";
import { EssPortalPage } from "./modules/ess/EssPortalPage";
import { MobileGeoPunchPage } from "./modules/ess/MobileGeoPunchPage";
import { BranchGeofencePage } from "./modules/org/BranchGeofencePage";
import { PlaceholderPage } from "./modules/common/PlaceholderPage";
import { NotFoundPage } from "./modules/common/NotFoundPage";

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
          <Route path="/ess" element={<EssPortalPage />} />
          <Route path="/ess/mobile-punch" element={<MobileGeoPunchPage />} />
          <Route path="/attendance" element={<DailyAttendancePage />} />
          <Route path="/attendance/daily" element={<Navigate to="/attendance" replace />} />
          <Route path="/punches" element={<PunchStreamPage />} />
          <Route path="/attendance/punches" element={<Navigate to="/punches" replace />} />
          <Route path="/muster" element={<MusterRollPage />} />
          <Route path="/attendance/muster" element={<Navigate to="/muster" replace />} />
          <Route
            path="/anomalies"
            element={
              <PlaceholderPage
                title="Punch Anomalies & Continuous Absentees"
                moduleName="Operations"
                description="Unpaired punches, missing in/out timestamps, and continuous 3-day absence exception queues."
              />
            }
          />
          <Route
            path="/devices"
            element={
              <PlaceholderPage
                title="Biometric Device Fleet"
                moduleName="Operations"
                description="Terminal connectivity heartbeats, push/pull communication telemetry, and template sync queues."
              />
            }
          />

          {/* Scheduling */}
          <Route path="/shifts" element={<ShiftTemplatesPage />} />
          <Route path="/shifts/templates" element={<Navigate to="/shifts" replace />} />
          <Route path="/roster" element={<RosterMatrixPage />} />
          <Route path="/shifts/roster" element={<Navigate to="/roster" replace />} />
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
          <Route path="/admin/pending-actions" element={<PendingActionsPage />} />
          <Route path="/pending-actions" element={<Navigate to="/admin/pending-actions" replace />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/org/branches" element={<Navigate to="/admin/branches" replace />} />
          <Route path="/org/departments" element={<DepartmentsPage />} />
          <Route path="/org/designations" element={<DesignationsPage />} />

          {/* Administration & IAM */}
          <Route path="/admin/branches" element={<BranchesPage />} />
          <Route path="/admin/branches/geofence" element={<BranchGeofencePage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />

          {/* 404 Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
