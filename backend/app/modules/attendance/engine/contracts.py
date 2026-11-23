from dataclasses import dataclass, field
from datetime import date, time
from uuid import UUID


@dataclass
class SessionWindow:
    session_order: int
    start_time: time
    end_time: time
    pre_window_minutes: int = 60
    post_window_minutes: int = 120
    min_presence_ratio: float = 0.50
    break_duration_minutes: int = 0
    is_overnight: bool = False
    name: str = "Session"


@dataclass
class ShiftInstanceContract:
    calendar_date: date
    shift_type: str = "FIXED"  # FIXED, SPLIT, OVERNIGHT, CONTINUOUS
    shift_template_id: UUID | None = None
    dated_shift_instance_id: UUID | None = None
    is_rest_day: bool = False
    is_cancelled_paid: bool = False  # N66d
    sessions: list[SessionWindow] = field(default_factory=list)
