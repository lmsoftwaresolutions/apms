# APMS Open Questions & Decision Register

## 1. Classification & Status Legend

This document registers all product questions, architectural decisions, and domain edge cases across APMS. Every entry has an unambiguous status tag:

- **CONFIRMED**: Formally approved by the Product Owner / Principal Architect and locked.
- **RECOMMENDED**: Architecturally analyzed with an expert recommendation, awaiting PO sign-off.
- **OPEN**: Actively under discussion; alternatives presented.
- **DEFERRED**: Scheduled for post-MVP evaluation (Phases 4–6).

---

## 2. Core Architectural & Domain Questions (`Q1`–`Q25`)

| ID | Topic | Question / Decision Summary | Recommended / Confirmed Decision | Status |
| :--- | :--- | :--- | :--- | :--- |
| `Q1` | Multi-Tenancy Architecture | Shared database vs database-per-tenant? | Shared database with PostgreSQL Row-Level Security (RLS) on `tenant_id`. | CONFIRMED |
| `Q2` | Raw Ingestion Immutability | How should raw biometric device pushes be stored? | Stored append-only in `raw_envelope` with SHA-256 payload hash chaining. Normalized into `punch_event`. Raw never modified. | CONFIRMED |
| `Q3` | Configuration Hierarchy | How do tenant policies inherit across organizational tiers? | Strict 4-tier inheritance: System Defaults $\rightarrow$ Tenant $\rightarrow$ Branch $\rightarrow$ Department $\rightarrow$ Employee. | CONFIRMED |
| `Q4` | Single-Punch Anomaly Default | What is the system default when an employee punches only once in a scheduled shift? | Mark status as `NEEDS_REVIEW` with `SINGLE_PUNCH_ANOMALY`. Resolvable via admin manual punch (`ATT-06`) or ESS regularization (`ATT-10`). | CONFIRMED |
| `Q5` | 24h+ Multi-Day Shift Attribution | How should 24-hour continuous or multi-day shifts be attributed for attendance and payroll? | Split into discrete `duty_units` (e.g., 8h/12h blocks) for hospitals/healthcare, or attribute to shift `start_date` for manufacturing. Default: `start_date` with configurable `duty_units`. | RECOMMENDED |
| `Q6` | WFH Approval Workflow | Should Work-From-Home requests require manual supervisor approval? | Auto-approve WFH requests within configured monthly quota (e.g., up to 4 days/month). Requests exceeding quota require manager approval. | CONFIRMED |
| `Q7` | Payroll Execution Workflow | How should payroll be executed to ensure compliance and zero errors? | Guided 10-step pay run wizard with pre-payroll reconciliation, automated variance checks, and post-lock immutable ledger posting. | CONFIRMED |
| `Q8` | Biometric Hardware Protocols | Which device protocols are supported natively? | ZKTeco ADMS push protocol, eTimeOffice HTTP push, CSV/Excel file import, and local Edge Sync Agent daemon. | CONFIRMED |
| `Q9` | Leave Balance Storage | How should leave balances be stored in the database? | Double-entry transaction ledger (`leave_transaction`). Balances are derived from append-only transaction sums. | CONFIRMED |
| `Q10` | Database Engine & Version | What is the minimum verified database engine? | PostgreSQL 16+ utilizing declarative table partitioning and native RLS. | CONFIRMED |
| `Q11` | Overtime Rate Multipliers | How should overtime rates be configured? | Configurable multiplier per shift policy (default 1.5x normal wage on weekdays, 2.0x on weekly offs/holidays). | CONFIRMED |
| `Q12` | Shift Swap Approvals | What approval chain is required for peer shift swaps? | Two-step workflow: peer employee acceptance followed by supervisor approval. | CONFIRMED |
| `Q13` | Grace Period & Late Bands | How should late arrival penalties be structured? | Grace period (default 15m) followed by progressive penalty bands (e.g., 3 lates in a month = 0.5 day LOP). | CONFIRMED |
| `Q14` | EPF Statutory Wage Ceiling | How should the EPF ceiling be handled? | Parameterized in effective-dated statutory tables (default ₹15,000/month), allowing voluntary opt-in for higher PF. | CONFIRMED |
| `Q15` | ESI Gross Ceiling | How should ESI eligibility be handled? | Parameterized in effective-dated statutory tables (default ₹21,000/month); coverage extends through full contribution period. | CONFIRMED |
| `Q16` | Sandwich Rule Configuration | How should sandwich rules be applied to weekly offs? | Configurable per tenant/pay group: toggleable for Weekly Offs, Public Holidays, or both. | CONFIRMED |
| `Q17` | Payslip Distribution Security | How should payslips be protected? | Server-side PDF generation, AES-256 encrypted at rest, password-protected using employee DOB/PAN on download. | CONFIRMED |
| `Q18` | DPDP Act 2023 Compliance | How does APMS handle employee consent and data deletion? | Explicit biometric consent capture, purpose limitation tagging, and automated masking of PII after statutory retention expiry. | CONFIRMED |
| `Q19` | Edge Sync Resilience | How does the on-premises Edge Agent handle network outages? | Local SQLite buffering retaining up to 7 days of punch logs, with automatic exponential backoff retry upon reconnect. | CONFIRMED |
| `Q20` | International Payroll | When will multi-country statutory engines (US, UK, GCC) be supported? | International localization packs deferred to Phase 6. Core MVP focuses on India statutory engine. | DEFERRED |
| `Q21` | OSH Code OT default | Post 21-Nov-2025 Labour Codes: default OT multiplier and state caps? | Default **2.0×** ordinary wage (OSH Code s.27); state caps in versioned tables; counsel to confirm state rules. | RECOMMENDED |
| `Q22` | DPDP biometric basis | Consent ledger vs s.7(i) employment legitimate use for workplace biometrics? | Keep explicit consent ledger through SPDI→DPDP transition; notice always; counsel memo before GA privacy copy. | OPEN |
| `Q23` | Vertical WTP validation | Confirm Capture ₹39 / Workforce ₹69 / Command ₹109 vs MSME floors ₹15–45? | Run 10 payroll-admin interviews (factory + hospital); adjust packs only after data. | OPEN |

---

## 3. Product Decision Analysis Register (`N65`, `N66a`–`N66d`, `N67`, `N18`, `N20`)

| ID | Scope | Core Decision Rationale | Status |
| :--- | :--- | :--- | :--- |
| `N65` | Mid-Shift Gap Classification | **Gap Free Exit/Stay; Boundary Punches Mandatory**: Mid-shift gaps between scheduled sessions (e.g., 08:00–12:00 and 16:00–20:00) are strictly non-working time and excluded from worked hours and OT denominators. Intra-session break thresholds apply only within a single session. Gaps never merge or split sessions. | CONFIRMED |
| `N66a` | Daily Rollup Mode & Status Bands | **`DURATION_RATIO` Default**: Daily status mapped via coverage ratio $R = \text{Worked} / \text{Scheduled}$. Policy bands: $R \ge 0.90 \rightarrow \text{PRESENT}$; $0.50 \le R < 0.90 \rightarrow \text{HALF_DAY}$; $R < 0.50 \rightarrow \text{ABSENT}$. Accommodates unequal session durations cleanly. | CONFIRMED |
| `N66b` | Session Min-Presence Eligibility | **Eligibility Separate from Duration**: Session completeness requires minimum presence $\mu_j$ (default 50%). If one full session is `BELOW_MIN` or absent in a 2-session shift, daily status is capped at `HALF_DAY`, even if overall daily worked hours meet the PRESENT threshold. | CONFIRMED |
| `N66c` | Half-Day / Partial Leave Mapping | **Session-Targeted Leave**: Half-day leave explicitly targets `First Half` ($\text{Session}_1$) or `Second Half` ($\text{Session}_2$). The targeted session is waived with 0.5 leave credit; non-targeted session is evaluated strictly on worked punches. Prevents incorrect deductions in unequal sessions. | CONFIRMED |
| `N66d` | Employer-Cancelled Sessions | **`CANCELLED_PAID` for Salaried**: Management-cancelled sessions under `ROS-10` default to `CANCELLED_PAID` with full credit for salaried staff. Per-session (`PAY-14`) staff configurable between fixed cancellation fee or exclusion without penalty. | CONFIRMED |
| `N67` | Ad-Hoc Same-Day Schedule Changes | **Dual-Path Architecture**: Supervisors/managers can directly override an employee's dated shift instance for date $D$ without altering recurring rotation patterns. Employees can submit a same-day change request via ESS subject to approval. Immediate re-calculation enqueued. | CONFIRMED |
| `N20` | Overtime Pre/Post Approval | **Approval-Gated Overtime**: Extra hours beyond scheduled shift do not automatically credit as overtime. Explicit supervisor authorization required prior to payroll processing. | CONFIRMED |
| `N18` | Pay Cut-Off Cycle vs Attendance Cycle | **Calendar Month Default with Configurable Cut-Off**: Pay Group can configure attendance cut-off (e.g., 25th of prior month to 24th of current month) while payroll disburses on the 1st. Default for new tenants: standard calendar month (1st to end-of-month). | RECOMMENDED |

---

## 4. Open Tenant Policy Questions

1. **Negative Leave Balance Handling**: When an employee exhausts paid leave balances, should the system allow negative accrual (advance leave) or automatically convert excess days to Loss of Pay (LOP)?
   - *Current Recommendation*: Configurable per leave type via `allow_negative_balance` flag (default: `false` $\rightarrow$ auto LOP).
2. **Holiday Pay for Variable/Per-Session Workers**: How should unworked national holidays be compensated for per-session (`PAY-14`) faculty?
   - *Current Recommendation*: Parameter in Pay Group to either pay average daily earnings or exclude from payment.

