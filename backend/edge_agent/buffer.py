"""Local punch buffer for the factory Edge Sync Agent.

This package does not pair punches or calculate attendance. It only queues
payloads until the cloud ingest accepts them.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path


class PunchBuffer:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._db = sqlite3.connect(path)
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS queued_punch (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payload TEXT NOT NULL,
              queued_at TEXT NOT NULL,
              uploaded_at TEXT
            )
            """
        )
        self._db.commit()

    def enqueue(self, payload: str, queued_at: datetime | None = None) -> int:
        moment = (queued_at or datetime.now(UTC)).astimezone(UTC).isoformat()
        cursor = self._db.execute(
            "INSERT INTO queued_punch (payload, queued_at) VALUES (?, ?)",
            (payload, moment),
        )
        self._db.commit()
        return int(cursor.lastrowid)

    def pending(self) -> list[tuple[int, str]]:
        rows = self._db.execute(
            "SELECT id, payload FROM queued_punch WHERE uploaded_at IS NULL ORDER BY id"
        ).fetchall()
        return [(int(row[0]), str(row[1])) for row in rows]

    def mark_uploaded(self, punch_id: int, uploaded_at: datetime | None = None) -> None:
        moment = (uploaded_at or datetime.now(UTC)).astimezone(UTC).isoformat()
        self._db.execute(
            "UPDATE queued_punch SET uploaded_at = ? WHERE id = ?",
            (moment, punch_id),
        )
        self._db.commit()

    def sweep(self, now: datetime, retention_days: int = 7) -> int:
        cutoff = (now.astimezone(UTC) - timedelta(days=retention_days)).isoformat()
        cursor = self._db.execute(
            "DELETE FROM queued_punch WHERE uploaded_at IS NOT NULL AND uploaded_at < ?",
            (cutoff,),
        )
        self._db.commit()
        return int(cursor.rowcount)

    def close(self) -> None:
        self._db.close()
