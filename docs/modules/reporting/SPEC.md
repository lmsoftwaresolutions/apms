# Module Specification: Reporting & Analytics Engine (M8)

## 1. Module Overview & Scope

The Reporting & Analytics Engine provides operational visibility, statutory compliance registers, financial audit reports, and analytical insights across all workforce data.

Reports are generated server-side using streaming cursors and asynchronous background workers to ensure that massive exports (e.g. 50,000 employee monthly muster rolls) execute without server memory exhaustion or HTTP request timeouts.

---

## 2. Applicable Requirements & Compliance Mandates

- **Requirements**: `RPT-01` (Form 25 Statutory Muster Roll), `RPT-02` (Daily Attendance Summary), `RPT-03` (Statutory Contribution Reports), `INT-01` (Tally ERP XML).
- **Statutory Mandates**:
  - Indian Factories Act 1948 — Form 25 (Muster Roll).
  - State Shops & Commercial Establishments Acts — Attendance & Wage Registers.
  - Employees' Provident Fund (EPF) Electronic Challan cum Return (ECR) text format.
  - Employees' State Insurance (ESI) monthly contribution file format.

---

## 3. Core Report Catalog

### 3.1 Form 25 Statutory Muster Roll (`RPT-01`)
- Standard 31-day tabular matrix displaying every employee's daily status codes:
  - `P`: Present (Full Day)
  - `HD`: Half Day Present
  - `A`: Absent / Loss of Pay
  - `WO`: Weekly Off
  - `H`: Public Holiday
  - `EL` / `CL` / `SL`: Paid Leave Types
  - `CO`: Compensatory Off
- Includes summary columns: Total Worked Days, Total Paid Days, Total LOP Days, Total Overtime Hours.

### 3.2 Daily Operations Dashboard (`RPT-02`)
- Real-time operational view:
  - Total Headcount, Present Count, Absent Count, On Leave Count.
  - Late Arrivals Count, Early Departures Count.
  - Un-regularized Single Punch Anomalies (`Q4`).
- Filterable by Branch, Department, Shift, and Designation.

### 3.3 Statutory Compliance Schedules (`RPT-03`)
- **EPF ECR File**: Pre-formatted `#~#` delimited text file ready for direct upload to the EPFO Unified Portal, containing UAN, Member Name, Gross Wages, EPF Wages, EPS Wages, EDLI Wages, and contribution amounts.
- **ESI Monthly Return**: Formatted Excel/CSV for the ESIC portal upload.
- **Professional Tax Summary**: State-wise monthly tax deduction totals and employee counts.

---

## 4. Architecture & Performance Patterns

1. **Server-Side Asynchronous Export**:
   - Report requests for $> 500$ records are dispatched to Celery background workers.
   - Workers query PostgreSQL using server-side cursor streaming (`yield_per(1000)` in SQLAlchemy).
   - Generated files (CSV, XLSX, PDF) are saved to secure cloud object storage with signed, expiring download URLs.
2. **Immutable Point-in-Time Data Sources**:
   - Historical payroll reports query `pay_run_employee_snapshots` directly, ensuring exact fidelity to historical pay runs even if current employee master data has changed.

