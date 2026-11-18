# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary (first UI):** Shift supervisor on the floor or in a plant office during a live shift. Situation: people are clocking in (or failing to), the roster may be wrong, and missed punches must be fixed before the day hardens. Job: know who is in, who is late, and who is missing—then correct today’s roster/punches without waiting on payroll.

**Secondary (same hierarchy):** Owner / plant decision-maker above the supervisor. Situation: needs trust that today’s floor matches reality and that exceptions are handled. Job: glance for exceptions and outcomes, not operate every punch.

Other audiences (HR admin, payroll clerk, field/geo, multi-site device ops) exist in the product roadmap but are not the first UI focus.

## Product Purpose

APMS is an India-first multi-tenant B2B SaaS for vendor-agnostic workforce capture, deterministic attendance with explanation traces, leave, and (later) statutory payroll—positioned externally as a **Workforce Operating Platform**: one connected system for people, attendance, payroll, performance, and operations.

**Day-one success for the first UI:** in under a minute, the shift supervisor can see **live who is in and who is late on this shift**.

**Product success (broader):** the paid day, with the reason, from whatever capture method the site already uses—without locking the customer to one biometric OEM.

## Positioning

Mechanism neighbors cannot truthfully copy as a wedge: **Capture → Calculate → Explain → Act** on multi-modal punches (adapters for devices the customer already owns), with immutable explanation traces for attendance (and later pay), while keeping attendance math separate from payroll and never storing raw biometric templates in the cloud.

External line the product owns:

- *Your workforce. One connected system.*
- *People. Attendance. Payroll. Performance. Operations.*
- *Capture · Calculate · Explain · Act*
- Designed for hospitals, manufacturing, retail, education, and growing businesses.

## Operating Context

- Live shift floor / supervisor station (often shared PC or phone) during shift start and mid-shift exceptions.
- Existing biometric terminals, RFID, phone/geo, and optional CCTV/edge paths feeding adapters—not a single-vendor desktop utility.
- Dated shift instances and same-day roster fixes; missed-punch correction before muster hardens.
- Site muster as the audit artifact before salary (payroll calculation is V2).
- Multi-tenant SaaS: each customer org brings its own company identity into the shell.

## Capabilities and Constraints

**Confirmed for product direction**

- Multi-tenant web SaaS; PostgreSQL RLS; React admin/ops UI; FastAPI backend (see repo `CONTEXT.md`).
- V1 centers on capture, shifts/roster, leave, field/hospital/education duty paths as scoped in `CONTEXT.md` §10; **explainable attendance / muster**; no salary math in V1.
- Processor separation: adapters ≠ attendance ≠ payroll ≠ analytics; append-only punches; explanation traces; no cloud raw biometric templates.
- First UI priority: live shift presence / lateness for supervisors; then owner-level visibility up the hierarchy.

**Tenant branding (required)**

- Every customer must be able to set at least **company name** and **logo** in the product chrome (white-label space reserved; not a fixed LM-only skin).

**Open / undecided**

- Legal/marketing product trademark string vs internal name **APMS** — external category name **Workforce Operating Platform** is the stated framing; formal rename of the codebase/legal entity is not decided here.
- Hindi-first UI, owned brand colours, and final logo assets — none confirmed yet.
- Comp vs code build-path default for landing/showcase — not stored (preference noted in session only).

## Brand Commitments

- Internal / system name in the repo: **APMS**.
- External product framing (user-stated): **Workforce Operating Platform**.
- Tagline: *Your workforce. One connected system.*
- Scope line: *People. Attendance. Payroll. Performance. Operations.*
- Operating motto: *Capture · Calculate · Explain · Act*.
- Vertical mention in messaging: hospitals, manufacturing, retail, education, and growing businesses.
- SaaS customer branding: product UI must leave room for customer **company name** and **logo**.
- No other binding visual identity (palette, type, illustration system) established in init.

## Evidence on Hand

- Authoritative product SSOT: `CONTEXT.md`
- Requirements: `docs/product/SRS.md`, `docs/requirements/BUSINESS_RULES.md`, `docs/requirements/OPEN_QUESTIONS.md`
- Market notes: `docs/market/MARKET_RESEARCH.md`
- Schema draft: `docs/database/schema.dbml`
- No production UI, customer logos, testimonials, case studies, or press assets in-repo — do not fabricate them in design or marketing surfaces.

## Product Principles

1. **Floor truth first** — Prefer live shift clarity (in / late / missing) over deep HR configuration on day one.
2. **Explain before you act** — Every attendance outcome should be inspectable; fixes should recompute with a reason, not silent overrides.
3. **Own the devices they have** — Adapters and vendor-agnostic capture beat OEM lock-in.
4. **Tenant identity is first-class** — Customer name and logo belong in the shell; the platform brand frames, it does not replace the employer.
5. **Separate compute from pay** — Attendance can ship and earn trust before payroll math; never conflate the two processors.

## Accessibility & Inclusion

No product-specific accessibility standard was confirmed in init beyond shipping a usable web UI for supervisors on shared/desk browsers. Treat WCAG-oriented web practice as the default working bar until a stricter bar is set.
