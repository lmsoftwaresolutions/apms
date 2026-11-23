from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ProblemError(Exception):
    def __init__(self, status: int, title: str, detail: str) -> None:
        self.status = status
        self.title = title
        self.detail = detail

    @property
    def status_code(self) -> int:
        return self.status


def problem_body(status: int, title: str, detail: str) -> dict[str, object]:
    return {
        "type": "about:blank",
        "title": title,
        "status": status,
        "detail": detail,
    }


def register_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def handle_problem(_: Request, exc: ProblemError) -> JSONResponse:
        return JSONResponse(
            problem_body(exc.status, exc.title, exc.detail),
            status_code=exc.status,
            media_type="application/problem+json",
        )
