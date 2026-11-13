# APMS Industry Requirements & Vertical Profiles

## 1. Overview

APMS is designed with configurable policy engines that adapt to the distinct operational realities of different industries without code changes. This document formalizes the industry-specific configurations, shift behaviors, attendance rules, and payroll structures supported natively.

---

## 2. Industry Profiles

### 2.1 Education & Coaching Institutes
- **Operational Reality**: Faculty members, lecturers, and admin staff operate on split schedules (e.g., Morning Session 08:00–12:00, Evening Session 16:00–20:00). Mid-shift breaks between sessions can span 3 to 5 hours. Faculty are frequently compensated via per-lecture or per-session payout rates (`PAY-14`).
- **Shift Requirements**: Multi-session scheduled shifts (`SHF-03`). Explicit session definition with individual start/end times.
- **Attendance Rules**:
  - Gaps between sessions are free/untracked (`N65`).
  - Attendance rollup defaults to `DURATION_RATIO` with session minimum presence (`N66a`, `N66b`).
  - Session-targeted half-day leave mapping (`N66c`).
  - Employer-cancelled lecture sessions are marked `CANCELLED_PAID` for salaried staff and configurable for per-session staff (`N66d`, `ROS-10`).
- **Payroll Rules**: Hybrid structure combining fixed base salary with per-session lecture incentives. Academic calendars with seasonal vacation freezes.

### 2.2 Hospitals & 24/7 Healthcare
- **Operational Reality**: Continuous 24/7 operations, 3 rotating 8-hour shifts plus specialized 12-hour or 24-hour emergency on-call shifts. Cross-midnight shift work is constant. Doctors have on-call stipends; nursing staff rotate through strict duty rosters.
- **Shift Requirements**:
  - Overnight shifts (`SHF-02`) with cross-midnight boundary attribution (`ATT-03`).
  - Continuous 24/7 rotating rosters (`ROS-02`).
  - Multi-day 24h+ duty attribution defaulting to duty units or shift start date (`Q5`).
- **Attendance Rules**:
  - Single-punch anomalies default to `NEEDS_REVIEW` to prevent automatic unearned payouts while allowing manual admin punch correction (`Q4`).
  - Strict minimum rest periods between shifts (e.g., 12 hours minimum rest) flagging fatigue violations.
- **Payroll Rules**: On-call allowances, night shift differential allowances (`ALW-03`), locum doctor payout formulas.

### 2.3 Manufacturing & Industrial Plants
- **Operational Reality**: Heavy adherence to the Factories Act 1948. Fixed 3-shift rotation (Shift A: 06:00–14:00, Shift B: 14:00–22:00, Shift C: 22:00–06:00). Strictly regulated punch rounding, mandatory lunch/tea break deduction, strict overtime authorization rules (`N20`).
- **Shift Requirements**: Rotating shifts with weekly shift pattern changes (e.g., Monday rotation). Overnight Shift C crossing midnight.
- **Attendance Rules**:
  - Boundary punches mandatory (`N65`).
  - Configurable punch rounding bands (e.g., 15-minute rounding window).
  - Minimum presence threshold for half-day / full-day qualification.
  - Break policy deducting fixed 30/60 minutes unless verified by punch stream.
- **Payroll Rules**: Overtime calculated strictly as double normal wage (Factories Act standard) based on approved hours. Statutory compliance (ESI, EPF, LWF, Bonus Act) strictly required. Form 25 muster rolls.

### 2.4 Retail Chains & Multi-Branch Hospitality
- **Operational Reality**: Widely distributed branch footprint (e.g., 50–500 retail stores). Store staff rotate between morning and closing shifts. Staff frequently transfer between store locations or cover shifts at neighboring stores. High attrition and frequent onboarding.
- **Shift Requirements**: Open shifts, floating employee rosters, branch-level shift assignment.
- **Attendance Rules**:
  - Mobile punch with strict geofencing validation (`MOB-01`, `MOB-02`).
  - Penalty bands for tardiness (e.g., 3 late-comings in a month trigger a half-day deduction).
- **Payroll Rules**: Store-level performance allowances, minimum wage compliance checks across varying state wage tiers.

### 2.5 Information Technology & Professional Services
- **Operational Reality**: Primarily white-collar knowledge workers operating on flexible hours, hybrid home/office models, and remote assignments. Strict time clocks are secondary to core attendance presence and leave balance tracking.
- **Shift Requirements**: Flexible window shifts (e.g., core hours 11:00–16:00 with flexible total duration of 8 hours).
- **Attendance Rules**:
  - Work-From-Home (WFH) requests auto-approved within monthly quota (e.g., up to 4 days/month) (`Q6`).
  - Single punch handling with auto-regularization or self-service regularization workflows (`ATT-10`).
- **Payroll Rules**: CTC (Cost-to-Company) structures, flexi-benefit plans, Section 115BAC new tax regime vs old regime computations, voluntary provident fund (VPF), annual performance bonuses.

### 2.6 Security & Facility Management Services
- **Operational Reality**: Security guards and housekeeping staff deployed at client client sites. Shift timings depend on client contracts (8h or 12h shifts). High absenteeism requires rapid shift substitution ("relief guards"). Client billing is directly derived from verified attendance muster rolls.
- **Shift Requirements**: Client-site tagged rosters, replacement guard workflows (`ROS-06`), unassigned shift pools.
- **Attendance Rules**:
  - QR-code or biometric kiosk clock-in at client sites.
  - Zero tolerance for missing punch ambiguity; immediate alerts to area field officers when a post is unmanned.
- **Payroll Rules**: Daily-wage or monthly per-shift payout structures, client-specific billing muster rolls, strict compliance with statutory minimum wages per state and zone.

---

## 3. Configuration Matrix by Vertical

| Feature / Policy | Education | Healthcare | Manufacturing | Retail | IT / Tech | Security |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Shift Model** | Split / Multi-Session | 24/7 Continuous | Fixed 3-Shift | Morning / Evening | Flexible Core | 8h / 12h Site |
| **Mid-Shift Gap** | Untracked Free Gap | Not Applicable | Fixed Break Deduct | Untracked Break | Flexible | Tracked Post Gap |
| **Overtime Approval**| N/A | Post-shift verified | Strict Pre-approval | Manager Approval | Rarely Applicable | Site-supervisor auth |
| **Single Punch** | Needs Review | Needs Review | Needs Review | Needs Review | Auto-regularize | Needs Review |
| **WFH Policy** | Disabled | Disabled | Disabled | Disabled | Auto-approve quota| Disabled |
| **Payroll Basis** | Monthly + Per-lecture| Monthly + On-call | Hourly / Monthly | Monthly Base | Monthly CTC | Daily / Monthly |

