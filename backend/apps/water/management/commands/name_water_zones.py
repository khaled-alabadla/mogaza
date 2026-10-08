"""
Give water zones names people understand, based on the nearest roundabout / intersection:
«شرق دوار حيدر», «جنوب غرب مفترق الشعبية», «محيط مفترق الزهارنة».

    python manage.py name_water_zones [--all] [--dry-run]

By default only zones that still carry an automatic letter name («منطقة A») are renamed;
--all renames every zone (names typed by users are then replaced too).
Needs building coordinates (see `fetch_coordinates`); zones without any are named after
their best-known building («محيط مخبز عجور»).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.locations.models import Location
from apps.water.geo import AUTO_NAME_RE, Landmark, Point, describe_zone, is_landmark_name, mean_point
from apps.water.models import WaterZone


def _point(location):
    if location.latitude is None or location.longitude is None:
        return None
    return Point(float(location.latitude), float(location.longitude))


class Command(BaseCommand):
    help = "Rename water zones after nearby landmarks (e.g. «شرق دوار حيدر»)."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="Also rename zones whose names were typed by users")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        landmarks = [
            Landmark(location.place_name.strip(), _point(location))
            for location in Location.objects.filter(is_active=True, latitude__isnull=False)
            if is_landmark_name(location.place_name)
        ]
        self.stdout.write(f"{len(landmarks)} landmark(s) with coordinates")

        zones = list(WaterZone.objects.select_related("neighborhood").prefetch_related("locations")
                     .order_by("neighborhood__sort_order", "neighborhood__name", "sort_order", "id"))
        renamed = 0
        # Current name of every zone, updated as we go, so names stay unique within a neighborhood
        # even in --dry-run (where nothing is saved).
        names = {zone.pk: zone.name for zone in zones}
        with transaction.atomic():
            for zone in zones:
                if not options["all"] and not AUTO_NAME_RE.match(zone.name):
                    continue
                buildings = sorted((b for b in zone.locations.all() if b.is_active),
                                   key=lambda b: (not is_landmark_name(b.place_name), b.place_name))
                center = mean_point([_point(b) for b in buildings])
                taken = [names[z.pk] for z in zones if z.neighborhood_id == zone.neighborhood_id and z.pk != zone.pk]
                name = describe_zone(center, landmarks, taken, [b.place_name for b in buildings])
                if not name or name == zone.name:
                    continue
                names[zone.pk] = name
                self.stdout.write(f"  {zone.neighborhood.name}: {zone.name} → {name}")
                if options["dry_run"]:
                    continue
                before = zone.snapshot()
                zone.name = name
                zone.save(update_fields=["name", "updated_at"])
                log_action(AuditLog.Action.UPDATE, entity=zone, entity_type="waterzone", before=before,
                           after=zone.snapshot(), username="name_water_zones")
                renamed += 1
            if options["dry_run"]:
                transaction.set_rollback(True)
        self.stdout.write(self.style.SUCCESS(f"renamed: {renamed}" + ("  (dry run)" if options["dry_run"] else "")))
