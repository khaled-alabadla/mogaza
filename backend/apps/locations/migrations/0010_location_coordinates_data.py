"""
The map's coordinates of the known buildings (apps/locations/data/coordinates.json, from the
municipality GIS), matched by building number + street number. Only locations without coordinates
are filled: a point set from «الخريطة» is never changed. Safe to run on any database.
"""
import json
from decimal import Decimal
from pathlib import Path

from django.db import migrations

DATA = Path(__file__).resolve().parent.parent / "data" / "coordinates.json"


def fill_coordinates(apps, schema_editor):
    Location = apps.get_model("locations", "Location")
    points = {(b, s): (lat, lng) for b, s, lat, lng in json.loads(DATA.read_text(encoding="utf-8"))["rows"]}
    for location in Location.objects.filter(latitude__isnull=True).exclude(building_number="").exclude(street_number=""):
        point = points.get((location.building_number, location.street_number))
        if point:
            Location.objects.filter(pk=location.pk).update(latitude=Decimal(point[0]), longitude=Decimal(point[1]))


class Migration(migrations.Migration):
    dependencies = [("locations", "0009_circulars_data")]

    operations = [migrations.RunPython(fill_coordinates, migrations.RunPython.noop)]
