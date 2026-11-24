"""Excel muster roll generator with statutory formatting and color coding.

Attendance processor is strictly decoupled from payroll:
No wage, salary, or compensation columns are emitted.
"""

import calendar
import io
from typing import Any

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# Palette definitions
NAVY_HEADER = "1A365D"
BORDER_COLOR = "CBD5E1"

STATUS_STYLES = {
    "P": {
        "fill": PatternFill(start_color="D4EDDA", end_color="D4EDDA", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="155724"),
    },
    "A": {
        "fill": PatternFill(start_color="F8D7DA", end_color="F8D7DA", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="721C24"),
    },
    "HD": {
        "fill": PatternFill(start_color="FFF3CD", end_color="FFF3CD", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="856404"),
    },
    "WO": {
        "fill": PatternFill(start_color="E2E3E5", end_color="E2E3E5", fill_type="solid"),
        "font": Font(name="Arial", size=9, color="383D41"),
    },
    "H": {
        "fill": PatternFill(start_color="CCE5FF", end_color="CCE5FF", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="004085"),
    },
    # Statutory leaves
    "CL": {
        "fill": PatternFill(start_color="E8DAEF", end_color="E8DAEF", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="5B2C6F"),
    },
    "SL": {
        "fill": PatternFill(start_color="E8DAEF", end_color="E8DAEF", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="5B2C6F"),
    },
    "EL": {
        "fill": PatternFill(start_color="E8DAEF", end_color="E8DAEF", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="5B2C6F"),
    },
    "COMP_OFF": {
        "fill": PatternFill(start_color="E8DAEF", end_color="E8DAEF", fill_type="solid"),
        "font": Font(name="Arial", size=9, bold=True, color="5B2C6F"),
    },
}

LEAVE_FALLBACK_STYLE = {
    "fill": PatternFill(start_color="E8DAEF", end_color="E8DAEF", fill_type="solid"),
    "font": Font(name="Arial", size=9, bold=True, color="5B2C6F"),
}


def generate_muster_xlsx(
    data: dict[str, Any],
    tenant_meta: dict[str, Any],
    year: int,
    month: int,
) -> io.BytesIO:
    """Generate professional, styled Excel muster roll workbook."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Muster_{year}_{month:02d}"
    ws.views.sheetView[0].showGridLines = True

    num_days = calendar.monthrange(year, month)[1]
    month_name = tenant_meta.get("month_name") or calendar.month_name[month]
    tenant_name = tenant_meta.get("tenant_name", "APMS Enterprise")
    branch_name = tenant_meta.get("branch_name", "Main Branch")
    generated_at = tenant_meta.get("generated_at", "")

    thin_border = Border(
        left=Side(style="thin", color=BORDER_COLOR),
        right=Side(style="thin", color=BORDER_COLOR),
        top=Side(style="thin", color=BORDER_COLOR),
        bottom=Side(style="thin", color=BORDER_COLOR),
    )

    # 1. Header Block
    title_font = Font(name="Arial", size=14, bold=True, color="1A365D")
    sub_font = Font(name="Arial", size=10, bold=False, color="334155")
    meta_font = Font(name="Arial", size=9, italic=True, color="64748B")

    ws["A1"] = f"{tenant_name} — Statutory Muster Roll Register"
    ws["A1"].font = title_font
    ws["A2"] = f"Branch: {branch_name}  |  Period: {month_name} {year}"
    ws["A2"].font = sub_font
    ws["A3"] = f"Generated: {generated_at}  |  Statutory Form: Standard Register"
    ws["A3"].font = meta_font

    # 2. Table Column Headers
    header_row_idx = 5
    headers = [
        "Employee Code",
        "Employee Name",
        "Department",
        "Designation",
        *[d for d in range(1, num_days + 1)],
        "Total Days in Month",
        "Total Present Days",
        "Total Leave Days",
        "Total Absent",
        "Total Worked Hours",
        "Total Overtime Hours",
    ]

    header_font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color=NAVY_HEADER, end_color=NAVY_HEADER, fill_type="solid")
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center")
    right_align = Alignment(horizontal="right", vertical="center")

    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=header_row_idx, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = thin_border

    ws.row_dimensions[header_row_idx].height = 28

    # 3. Employee Data Rows
    employees = data.get("employees", [])
    data_font = Font(name="Arial", size=9)
    current_row = header_row_idx + 1

    for emp in employees:
        daily_status = emp.get("daily_status", {})
        summary = emp.get("summary", {})

        # Employee info
        c1 = ws.cell(row=current_row, column=1, value=emp.get("employee_code", ""))
        c1.alignment = center_align
        c2 = ws.cell(row=current_row, column=2, value=emp.get("employee_name", ""))
        c2.alignment = left_align
        c3 = ws.cell(row=current_row, column=3, value=emp.get("department", ""))
        c3.alignment = left_align
        c4 = ws.cell(row=current_row, column=4, value=emp.get("designation", ""))
        c4.alignment = left_align

        for c in (c1, c2, c3, c4):
            c.font = data_font
            c.border = thin_border

        # Day cells
        for day_num in range(1, num_days + 1):
            col_idx = 4 + day_num
            status_code = str(daily_status.get(day_num, "-"))
            cell = ws.cell(row=current_row, column=col_idx, value=status_code)
            cell.alignment = center_align
            cell.border = thin_border

            # Subtle color coding
            style = STATUS_STYLES.get(status_code)
            if not style and status_code not in {"-", ""}:
                style = LEAVE_FALLBACK_STYLE

            if style:
                cell.fill = style["fill"]
                cell.font = style["font"]
            else:
                cell.font = data_font

        # Summary columns
        summary_values = [
            summary.get("total_days", num_days),
            summary.get("total_present", 0),
            summary.get("total_leave", 0),
            summary.get("total_absent", 0),
            summary.get("worked_hours", 0),
            summary.get("ot_hours", 0),
        ]

        summary_start_col = 4 + num_days + 1
        for s_idx, s_val in enumerate(summary_values):
            col_idx = summary_start_col + s_idx
            cell = ws.cell(row=current_row, column=col_idx, value=s_val)
            cell.font = data_font
            cell.alignment = right_align
            cell.border = thin_border

        ws.row_dimensions[current_row].height = 20
        current_row += 1

    # 4. Legend & Statutory Disclaimer Block
    legend_row = current_row + 2
    ws.cell(row=legend_row, column=1, value="STATUS CODES LEGEND:").font = Font(name="Arial", size=9, bold=True, color="1A365D")
    legend_text = (
        "P = Present (Full Day)  |  A = Absent  |  HD = Half Day  |  WO = Weekly Off  |  H = Holiday  |  "
        "CL = Casual Leave  |  SL = Sick Leave  |  EL = Earned Leave  |  COMP_OFF = Compensatory Off"
    )
    ws.cell(row=legend_row + 1, column=1, value=legend_text).font = Font(name="Arial", size=8, color="475569")

    disclaimer_row = legend_row + 3
    ws.cell(row=disclaimer_row, column=1, value="STATUTORY COMPLIANCE DISCLAIMER:").font = Font(
        name="Arial", size=9, bold=True, color="1A365D"
    )
    disclaimer_text = (
        "Statutory Attendance Register generated pursuant to applicable Indian Labour Laws "
        "(The Factories Act 1948 Section 62, CLRA Act 1970, and Central Rules). "
        "Attendance processor is strictly decoupled from payroll processor: "
        "this register records physical time intervals and status codes only."
    )
    ws.cell(row=disclaimer_row + 1, column=1, value=disclaimer_text).font = Font(
        name="Arial", size=8, italic=True, color="64748B"
    )

    # 5. Column Width Formatting
    ws.column_dimensions["A"].width = 16  # Employee Code
    ws.column_dimensions["B"].width = 24  # Employee Name
    ws.column_dimensions["C"].width = 18  # Department
    ws.column_dimensions["D"].width = 18  # Designation

    for day_num in range(1, num_days + 1):
        col_letter = get_column_letter(4 + day_num)
        ws.column_dimensions[col_letter].width = 4.5

    for s_idx in range(len(summary_values) if employees else 6):
        col_letter = get_column_letter(4 + num_days + 1 + s_idx)
        ws.column_dimensions[col_letter].width = 14

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
