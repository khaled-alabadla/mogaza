"""
v2 step 2 (data): turn per-building slots into water zones, preserving the imported data.

Locations are grouped by (neighborhood, signature) where signature = sorted distinct
(day, start, end) of their slots (notes ignored, duplicate rows dropped). Each group becomes
one zone «منطقة A/B/...» whose slots are created once; buildings point at their zone.
Locations without a neighborhood go into «غير محدد» (created on demand).
"""
from django.db import migrations
from django.db.models import Max

from apps.water.zoning import UNKNOWN_NEIGHBORHOOD, plan_zones


def build_zones(apps, schema_editor):
    Location = apps.get_model("locations", "Location")
    Neighborhood = apps.get_model("water", "Neighborhood")
    WaterZone = apps.get_model("water", "WaterZone")
    WaterSlot = apps.get_model("water", "WaterSlot")

    rows = {}
    for slot in WaterSlot.objects.filter(location__isnull=False).order_by("location_id", "day", "start_time", "id"):
        rows.setdefault(slot.location_id, []).append(
            (slot.day, slot.start_time, slot.end_time, slot.note, slot.source))
    if not rows:
        return
    neighborhood_of = dict(Location.objects.filter(pk__in=rows).values_list("pk", "neighborhood_id"))
    plan = plan_zones((pk, neighborhood_of[pk], slots) for pk, slots in rows.items())

    for neighborhood_id, zones in plan.items():
        if neighborhood_id is None:
            neighborhood = Neighborhood.objects.filter(name=UNKNOWN_NEIGHBORHOOD).first()
            if neighborhood is None:
                top = Neighborhood.objects.aggregate(m=Max("sort_order"))["m"] or 0
                neighborhood = Neighborhood.objects.create(name=UNKNOWN_NEIGHBORHOOD, sort_order=top + 1)
            neighborhood_id = neighborhood.pk
        for item in zones:
            zone = WaterZone.objects.create(neighborhood_id=neighborhood_id, name=item["name"], code=item["code"],
                                            sort_order=item["sort_order"])
            WaterSlot.objects.bulk_create([
                WaterSlot(zone=zone, day=day, start_time=start, end_time=end, note=note, source=source)
                for day, start, end, note, source in item["slots"]
            ])
            # update() leaves updated_at / search_text untouched: this is not a user edit.
            Location.objects.filter(pk__in=item["location_ids"]).update(water_zone=zone)
            Location.objects.filter(pk__in=item["location_ids"], neighborhood__isnull=True).update(
                neighborhood_id=neighborhood_id)
    WaterSlot.objects.filter(location__isnull=False).delete()


def restore_location_slots(apps, schema_editor):
    """Best-effort reverse: copy each zone's slots back onto its buildings, then drop the zones."""
    Location = apps.get_model("locations", "Location")
    WaterZone = apps.get_model("water", "WaterZone")
    WaterSlot = apps.get_model("water", "WaterSlot")
    copies = []
    for location in Location.objects.filter(water_zone__isnull=False):
        for slot in WaterSlot.objects.filter(zone_id=location.water_zone_id):
            copies.append(WaterSlot(location=location, day=slot.day, start_time=slot.start_time,
                                    end_time=slot.end_time, note=slot.note, source=slot.source))
    Location.objects.update(water_zone=None)
    WaterSlot.objects.filter(zone__isnull=False).delete()
    WaterZone.objects.all().delete()
    WaterSlot.objects.bulk_create(copies)


class Migration(migrations.Migration):

    dependencies = [
        ("water", "0003_waterzone"),
        ("locations", "0003_location_water_zone"),
    ]

    operations = [
        migrations.RunPython(build_zones, restore_location_slots),
    ]
