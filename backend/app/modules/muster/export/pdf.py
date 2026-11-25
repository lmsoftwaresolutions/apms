"""Statutory PDF muster roll generator formatted to Indian labour schedules.

Supports:
- Form 25 (Factories Act 1948 - Section 62)
- Form II / Form XVI (CLRA Act - Rule 78(1)(a)(i))
- Form T (Combined Register under Central Ease-of-Compliance Rules 2017)
- Standard APMS attendance register

Attendance processor is strictly decoupled from payroll:
No wage or monetary amounts are represented.
"""

import calendar
import io
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


class NumberedCanvas:
    """Canvas wrapper that stamps total page count and footer onto each page."""

    # Handled via ReportLab build callback if needed; SimpleDocTemplate suffices with onFirstPage/onLaterPages.


def _page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#64748B"))
    footer_text = f"APMS Statutory Muster Roll  |  Page {doc.page}  |  Generated under Indian Labour Compliance Standards"
    canvas.drawString(20, 15, footer_text)
    canvas.restoreState()


def generate_muster_pdf(
    data: dict[str, Any],
    tenant_meta: dict[str, Any],
    year: int,
    month: int,
    template: str = "standard",
) -> io.BytesIO:
    """Generate statutory PDF attendance register in landscape A4."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=14,
        rightMargin=14,
        topMargin=16,
        bottomMargin=24,
    )

    num_days = calendar.monthrange(year, month)[1]
    month_name = tenant_meta.get("month_name") or calendar.month_name[month]
    tenant_name = tenant_meta.get("tenant_name", "APMS Enterprise")
    branch_name = tenant_meta.get("branch_name", "Main Branch")
    factory_name = tenant_meta.get("factory_name", tenant_name)
    reg_number = tenant_meta.get("registration_number") or ""
    est_name = tenant_meta.get("establishment_name", tenant_name)
    contractor_name = tenant_meta.get("contractor_name", "N/A - Direct Employment")
    generated_at = tenant_meta.get("generated_at", "")

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=13,
        textColor=colors.HexColor("#1A365D"),
        alignment=1,  # Center
        spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#334155"),
        alignment=1,
        spaceAfter=3,
    )
    meta_style = ParagraphStyle(
        "DocMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#475569"),
        alignment=1,
        spaceAfter=6,
    )

    elements = []

    # 1. Statutory Header Selection
    tpl = template.lower()
    if tpl == "form_25":
        elements.append(Paragraph("FORM 25 (Prescribed under Rule 103)", title_style))
        elements.append(Paragraph("MUSTER ROLL (Under Section 62 of The Factories Act, 1948)", sub_style))
        elements.append(
            Paragraph(
                f"Name of Factory: <b>{factory_name}</b>  |  Registration / License No: <b>{reg_number}</b>  |  "
                f"Place: <b>{branch_name}</b>  |  For the Month & Year: <b>{month_name} {year}</b><br/>"
                f"Classification: Adult / Adolescent Workers  |  Relay / Shift Schedule: Prescribed Shifts",
                meta_style,
            )
        )
    elif tpl == "form_ii":
        elements.append(Paragraph("FORM II / FORM XVI (Register of Muster Roll)", title_style))
        elements.append(
            Paragraph(
                "[See Rule 78(1)(a)(i) of Contract Labour (Regulation & Abolition) Central Rules, 1971]",
                sub_style,
            )
        )
        elements.append(
            Paragraph(
                f"Name & Address of Contractor: <b>{contractor_name}</b>  |  "
                f"Name & Address of Establishment: <b>{est_name}</b><br/>"
                f"Principal Employer: <b>{tenant_name}</b>  |  Location / Branch: <b>{branch_name}</b>  |  "
                f"Month & Year: <b>{month_name} {year}</b>",
                meta_style,
            )
        )
    elif tpl == "form_t":
        elements.append(Paragraph("FORM T — COMBINED MUSTER ROLL", title_style))
        elements.append(
            Paragraph(
                "[See Rule 78(1)(a)(i) of Ease of Compliance to Maintain Registers under various Labour Laws Rules, 2017]",
                sub_style,
            )
        )
        elements.append(
            Paragraph(
                f"Establishment: <b>{est_name}</b>  |  Branch: <b>{branch_name}</b>  |  "
                f"Period: <b>{month_name} {year}</b>  |  "
                f"Statutory Notice: Daily Attendance & Hours Log (Decoupled from Payroll)",
                meta_style,
            )
        )
    else:  # Standard
        elements.append(Paragraph(f"{tenant_name} — Statutory Muster Roll Register", title_style))
        elements.append(Paragraph("STANDARD STATUTORY ATTENDANCE REGISTER", sub_style))
        elements.append(
            Paragraph(
                f"Branch: <b>{branch_name}</b>  |  Period: <b>{month_name} {year}</b>  |  "
                f"Generated: <b>{generated_at}</b>  |  Verification Status: Final Roll",
                meta_style,
            )
        )

    # 2. Table Column Headers
    table_headers = [
        "Sr",
        "Code",
        "Worker Name",
        "Dept / Desig",
        *[str(d) for d in range(1, num_days + 1)],
        "P",
        "A",
        "L",
        "Worked",
        "OT",
    ]

    # Calculate column widths to fit ~744 pt in ~814 pt printable space
    col_widths = [
        18,  # Sr
        38,  # Code
        64,  # Worker Name
        52,  # Dept/Desig
        *[14 for _ in range(num_days)],  # Days 1..N
        20,  # P
        20,  # A
        20,  # L
        32,  # Worked Hours
        26,  # OT Hours
    ]

    table_data = [table_headers]

    employees = data.get("employees", [])
    for idx, emp in enumerate(employees, start=1):
        daily = emp.get("daily_status", {})
        summary = emp.get("summary", {})
        dept_desig = f"{emp.get('department', '')[:8]} / {emp.get('designation', '')[:8]}"

        row = [
            str(idx),
            emp.get("employee_code", "")[:10],
            emp.get("employee_name", "")[:18],
            dept_desig,
            *[str(daily.get(d, "-")) for d in range(1, num_days + 1)],
            str(summary.get("total_present", 0)),
            str(summary.get("total_absent", 0)),
            str(summary.get("total_leave", 0)),
            str(summary.get("worked_hours", 0)),
            str(summary.get("ot_hours", 0)),
        ]
        table_data.append(row)

    # 3. Table Styling
    t_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A365D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 5.5),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0.5),
        # Column alignments: Left align name, center day codes and totals
        ("ALIGN", (2, 1), (3, -1), "LEFT"),
        ("ALIGN", (4, 1), (-1, -1), "CENTER"),
    ]

    # Alternating row background
    for r_idx in range(1, len(table_data)):
        if r_idx % 2 == 0:
            t_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), colors.HexColor("#F8FAFC")))

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle(t_style))
    elements.append(table)

    # 4. Signatory Block & Compliance Notes
    elements.append(Spacer(1, 12))

    if tpl == "form_25":
        sig_data = [
            [
                Paragraph("<b>Prepared By:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Signature of Manager / Factory Occupier:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Inspector of Factories / Labour Officer:</b> ____________________", styles["Normal"]),
            ],
            [
                Paragraph("Date: ______________", styles["Normal"]),
                Paragraph("Official Seal: ______________", styles["Normal"]),
                Paragraph("Inspection Date: ______________", styles["Normal"]),
            ],
        ]
    elif tpl == "form_ii":
        sig_data = [
            [
                Paragraph("<b>Signature of Contractor:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Principal Employer Representative:</b> ____________________", styles["Normal"]),
            ],
            [
                Paragraph("Date: ______________", styles["Normal"]),
                Paragraph("Establishment Seal: ______________", styles["Normal"]),
            ],
        ]
    elif tpl == "form_t":
        sig_data = [
            [
                Paragraph("<b>Signature of Employer / Manager:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Authorized Verification Officer:</b> ____________________", styles["Normal"]),
            ],
            [
                Paragraph("Date: ______________", styles["Normal"]),
                Paragraph("Verification Stamp: ______________", styles["Normal"]),
            ],
        ]
    else:
        sig_data = [
            [
                Paragraph("<b>Prepared By:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Checked By:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Authorized Signatory:</b> ____________________", styles["Normal"]),
            ]
        ]

    sig_table = Table(sig_data, colWidths=[240] * len(sig_data[0]))
    sig_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    elements.append(KeepTogether(sig_table))

    doc.build(elements, onFirstPage=_page_footer, onLaterPages=_page_footer)
    buffer.seek(0)
    return buffer
