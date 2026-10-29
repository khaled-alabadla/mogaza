"""Test helpers: a new location must have every field filled in (see REQUIRED_ON_ADD)."""
from apps.water.models import Neighborhood


def full_location(**fields):
    """The POST body of a complete new location; `fields` override (or add to) it."""
    hood, _ = Neighborhood.objects.get_or_create(name="حي الاختبار")
    return {"description": "وصف تجريبي", "building_number": "1", "street_number": "2", "neighborhood": hood.pk, **fields}
