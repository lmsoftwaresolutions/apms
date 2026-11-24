"""Export orchestration service for statutory muster roll downloads."""

import io
from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.modules.muster.export.csv import stream_muster_csv
from app.modules.muster.export.excel import generate_muster_xlsx
from app.modules.muster.export.pdf import generate_muster_pdf
from app.modules.muster.service import fetch_muster

VALID_FORMATS = {"xlsx", "csv", "pdf"}
VALID_TEMPLATES = {"standard", "form_25", "form_ii", "form_t"}

MEDIA_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv; charset=utf-8",
    "pdf": "application/pdf",
}


async def export_muster_file(
    session: AsyncSession,
    tenant_id: UUID,
    year: int,
    month: int,
    export_format: str = "xlsx",
    department_id: UUID | None = None,
    template: str = "standard",
) -> tuple[AsyncIterator[str] | io.BytesIO, str, str]:
    """Fetch muster data and generate the requested statutory export.

    Returns:
        (content, media_type, filename)
    """
    fmt = export_format.lower()
    if fmt not in VALID_FORMATS:
        raise ProblemError(422, "Invalid format", f"Supported formats: xlsx, csv, pdf. Got: {export_format}")

    tpl = template.lower()
    if tpl not in VALID_TEMPLATES:
        raise ProblemError(
            422,
            "Invalid template",
            f"Supported templates: standard, form_25, form_ii, form_t. Got: {template}",
        )

    data = await fetch_muster(session, tenant_id, year, month, department_id=department_id)
    tenant_meta = data["meta"]
    filename = f"muster_roll_{year}_{month:02d}_{tpl}.{fmt}"
    media_type = MEDIA_TYPES[fmt]

    if fmt == "xlsx":
        buffer = generate_muster_xlsx(data, tenant_meta, year, month)
        return buffer, media_type, filename

    if fmt == "csv":
        stream = stream_muster_csv(data, tenant_meta, year, month)
        return stream, media_type, filename

    # fmt == "pdf"
    buffer = generate_muster_pdf(data, tenant_meta, year, month, template=tpl)
    return buffer, media_type, filename
