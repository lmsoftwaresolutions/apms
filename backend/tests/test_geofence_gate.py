import pytest

from app.core.errors import ProblemError
from app.modules.ess.router import _require_inside_geofence


class _Branch:
    geofence_latitude = 18.5204
    geofence_longitude = 73.8567
    geofence_radius_m = 200


def test_inside_saved_radius_is_accepted() -> None:
    distance_m, radius_m = _require_inside_geofence(_Branch(), 18.52055, 73.85682)
    assert radius_m == 200
    assert distance_m < 50


def test_outside_saved_radius_is_refused() -> None:
    with pytest.raises(ProblemError) as exc:
        _require_inside_geofence(_Branch(), 18.55, 73.8568)
    assert exc.value.status == 422
    assert exc.value.title == "Outside the branch geofence"


def test_missing_radius_is_not_replaced_with_a_default() -> None:
    branch = _Branch()
    branch.geofence_radius_m = None
    with pytest.raises(ProblemError) as exc:
        _require_inside_geofence(branch, 18.5204, 73.8567)
    assert exc.value.title == "Geofence is not configured"
