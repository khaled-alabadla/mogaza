"""
Optional: store each building's location (centroid of its footprint) from the municipality GIS.

    python manage.py fetch_coordinates [--limit N] [--delay 1.0] [--only-missing] [--dry-run]

Uses the same public endpoint as the city map's building search (gaza-city.org/wfs_building),
one request per second at most. The web application never calls it.
"""
import time

from django.core.management.base import BaseCommand

from apps.locations.models import Location
from apps.water.geo import geojson_centroid

from .fetch_water_schedules import GazaCityClient

MIN_DELAY = 1.0


class Command(BaseCommand):
    help = "Optional: fetch building coordinates from gaza-city.org (never used by the web app)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--delay", type=float, default=MIN_DELAY)
        parser.add_argument("--only-missing", action="store_true", help="Skip locations that already have coordinates")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        delay = max(MIN_DELAY, options["delay"])
        qs = Location.objects.filter(is_active=True).exclude(building_number="").exclude(street_number="")
        if options["only_missing"]:
            qs = qs.filter(latitude__isnull=True)
        locations = list(qs.order_by("id")[: options["limit"]] if options["limit"] else qs.order_by("id"))
        client = GazaCityClient()
        found = missing = failed = 0
        self.stdout.write(f"Fetching coordinates for {len(locations)} location(s), {delay}s between requests")
        for index, location in enumerate(locations):
            if index:
                time.sleep(delay)
            try:
                point = geojson_centroid(client.building_geojson(location.building_number, location.street_number))
            except Exception as exc:  # one failure never aborts the run
                failed += 1
                self.stderr.write(f"  {location.place_name}: {exc}")
                continue
            if point is None:
                missing += 1
                self.stdout.write(f"  {location.place_name} ({location.building_number}/{location.street_number}): not found")
                continue
            found += 1
            self.stdout.write(f"  {location.place_name}: {point.lat}, {point.lon}")
            if not options["dry_run"]:
                Location.objects.filter(pk=location.pk).update(latitude=point.lat, longitude=point.lon)
        self.stdout.write(self.style.SUCCESS(f"found: {found}  not found: {missing}  failed: {failed}"
                                             + ("  (dry run)" if options["dry_run"] else "")))
