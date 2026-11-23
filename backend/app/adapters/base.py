from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class CanonicalPunch:
    employee_code: str
    punch_time: datetime
    source: str
    punch_direction: str = "UNKNOWN"  # IN, OUT, UNKNOWN
    device_identifier: str | None = None
    location_meta: dict[str, Any] | None = field(default=None)


class BasePunchAdapter(ABC):
    @abstractmethod
    def parse_payload(self, raw_payload: Any, device_identifier: str | None = None) -> list[CanonicalPunch]:
        """Normalize raw payload into a list of CanonicalPunch objects."""
        pass
