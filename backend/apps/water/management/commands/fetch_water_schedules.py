"""
OPTIONAL, controlled import of building water schedules from gaza-city.org.

    python manage.py fetch_water_schedules [--limit N] [--delay 1.0] [--dry-run] [--only-missing]

The web application never calls this command and never contacts gaza-city.org.

For each active location that has both a building and a street number:
  * POST building_num / street_num / _token to https://gaza-city.org/get_building_info
    (the CSRF token comes from the <meta name="csrf-token"> tag of /cityMap; cookies are kept)
  * parse the neighborhood (الحي) and the rows of <tbody id="building_crafts_mod">
  * link the location to that neighborhood (matched on the Arabic-normalized name, created if new)
  * v2 (water zones): find the zone of that neighborhood whose distinct (day, start, end) windows
    equal the parsed ones and assign the building to it; otherwise create the next lettered zone
    («منطقة A», «منطقة B» ...) with those slots (source="gaza-city.org") and assign it.
    Buildings with no schedule ("لا يوجد جدول مياه") keep their current zone.
Requests are spaced by at least one second. A failure for one location is logged and skipped.
"""
import html
import logging
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import time as dtime
from http.cookiejar import CookieJar

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max

from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.locations.models import Location
from apps.locations.text import clean_text, name_key, normalize_for_search
from apps.water.models import DAY_LABELS, Neighborhood, WaterSlot, WaterZone
from apps.water.zoning import UNKNOWN_NEIGHBORHOOD, default_zone_name, next_free_code, signature

logger = logging.getLogger(__name__)

BASE_URL = "https://gaza-city.org"
CITY_MAP_URL = f"{BASE_URL}/cityMap"
BUILDING_INFO_URL = f"{BASE_URL}/get_building_info"
BUILDING_GEOJSON_URL = f"{BASE_URL}/wfs_building"
MIN_DELAY = 1.0
TIMEOUT = 30

NO_SCHEDULE_TEXT = "لا يوجد جدول مياه"

# Day words as written on the site -> local week index (0=السبت). Keys are normalized below, so
# hamza / taa-marbuta variants (أحد/احد, جمعة/جمعه, الإثنين/الاثنين ...) all match.
_DAY_WORDS = {
    0: ["سبت", "السبت"],
    1: ["احد", "أحد", "الأحد", "الاحد"],
    2: ["اثنين", "الاثنين", "الإثنين"],
    3: ["ثلاثاء", "الثلاثاء"],
    4: ["اربعاء", "أربعاء", "الأربعاء", "الاربعاء"],
    5: ["خميس", "الخميس"],
    6: ["جمعة", "الجمعة"],
}
DAY_MAP = {normalize_for_search(word): day for day, words in _DAY_WORDS.items() for word in words}

_TAG = re.compile(r"<[^>]+>")
_TBODY = re.compile(r"<tbody\b[^>]*\bid\s*=\s*[\"']building_crafts_mod[\"'][^>]*>(.*?)(?:</tbody>|$)",
                    re.IGNORECASE | re.DOTALL)
_ROW = re.compile(r"<tr\b[^>]*>(.*?)(?=<tr\b|</tbody>|$)", re.IGNORECASE | re.DOTALL)
_CELL_START = re.compile(r"<td\b[^>]*>", re.IGNORECASE)
_TIME_RANGE = re.compile(r"(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})")
_CSRF_META = re.compile(r"<meta\s+[^>]*name\s*=\s*[\"']csrf-token[\"'][^>]*>", re.IGNORECASE)
_CONTENT_ATTR = re.compile(r"content\s*=\s*[\"']([^\"']*)[\"']", re.IGNORECASE)


@dataclass
class ParsedSlot:
    day: int
    start_time: dtime
    end_time: dtime
    note: str = ""


@dataclass
class BuildingInfo:
    neighborhood: str | None = None
    slots: list = field(default_factory=list)
    no_schedule: bool = False  # the page explicitly says there is no water schedule
    skipped_rows: list = field(default_factory=list)  # rows that could not be understood


def strip_tags(fragment):
    """Tags -> line breaks, entities decoded; returns the non-empty, whitespace-collapsed lines."""
    text = html.unescape(_TAG.sub("\n", fragment))
    return [line for line in (clean_text(part) for part in text.split("\n")) if line]


def parse_day(text):
    key = normalize_for_search(text)
    if key.startswith("يوم "):
        key = key[4:].strip()
    return DAY_MAP.get(key)


def _hhmm(hour, minute):
    hour, minute = int(hour), int(minute)
    if hour > 23 or minute > 59:
        raise ValueError
    return dtime(hour, minute)


def parse_time_range(text):
    """'02:00 - 06:00' -> (time(2, 0), time(6, 0)); None when unreadable or start == end."""
    match = _TIME_RANGE.search(normalize_for_search(text))  # also folds Arabic-Indic digits
    if not match:
        return None
    try:
        start, end = _hhmm(*match.group(1, 2)), _hhmm(*match.group(3, 4))
    except ValueError:
        return None
    return None if start == end else (start, end)


def parse_neighborhood(page):
    """The value after the label line exactly equal to "الحي:" (never "لجنة الحي:")."""
    lines = strip_tags(page)
    for index, line in enumerate(lines):
        if re.sub(r"\s*:\s*$", ":", line) == "الحي:":
            for value in lines[index + 1:]:
                if value.endswith(":"):  # the next label: the value is empty
                    return None
                return value
            return None
    return None


def parse_building_info(page):
    """Pure parser for the HTML returned by /get_building_info (tolerant of unclosed <td> tags)."""
    info = BuildingInfo(neighborhood=parse_neighborhood(page))
    tbody = _TBODY.search(page)
    if tbody:
        for row in _ROW.findall(tbody.group(1)):
            cells = [" ".join(strip_tags(cell)) for cell in _CELL_START.split(row)[1:]]
            if not any(cells):
                continue
            day = parse_day(cells[0]) if cells else None
            window = parse_time_range(cells[1]) if len(cells) > 1 else None
            if day is None or window is None:
                info.skipped_rows.append(cells)
                continue
            note = cells[2][:200] if len(cells) > 2 else ""
            info.slots.append(ParsedSlot(day=day, start_time=window[0], end_time=window[1], note=note))
    if not info.slots and NO_SCHEDULE_TEXT in " ".join(strip_tags(page)):
        info.no_schedule = True
    return info


def parse_csrf_token(page):
    for tag in _CSRF_META.findall(page):
        match = _CONTENT_ATTR.search(tag)
        if match:
            return html.unescape(match.group(1))
    return None


class GazaCityClient:
    """Minimal standard-library HTTP client (cookie jar + Laravel CSRF token)."""

    def __init__(self, timeout=TIMEOUT):
        self.timeout = timeout
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        self.token = None

    def _request(self, url, data=None):
        headers = {"User-Agent": "Mozilla/5.0", "Referer": CITY_MAP_URL, "X-Requested-With": "XMLHttpRequest",
                   "Accept-Language": "ar"}
        body = None
        if data is not None:
            body = urllib.parse.urlencode(data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
        request = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
        with self.opener.open(request, timeout=self.timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")

    def refresh_token(self):
        self.token = parse_csrf_token(self._request(CITY_MAP_URL))
        if not self.token:
            raise RuntimeError("csrf-token meta tag not found on /cityMap")
        return self.token

    def building_info(self, building_number, street_number):
        if not self.token:
            self.refresh_token()
        data = {"building_num": building_number, "street_num": street_number}
        try:
            return self._request(BUILDING_INFO_URL, {**data, "_token": self.token})
        except urllib.error.HTTPError as exc:
            if exc.code != 419:  # 419 = Laravel "page expired": get a fresh token and retry once
                raise
            self.refresh_token()
            return self._request(BUILDING_INFO_URL, {**data, "_token": self.token})

    def building_geojson(self, building_number, street_number):
        """GeoJSON FeatureCollection of the building footprint (WGS84), as used by the map's building search."""
        if not self.token:
            self.refresh_token()
        query = urllib.parse.urlencode({"building_num": building_number, "street_num": street_number,
                                        "_token": self.token})
        return self._request(f"{BUILDING_GEOJSON_URL}?{query}")


class Command(BaseCommand):
    help = "Optional: fetch building water schedules from gaza-city.org (never used by the web app)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None, help="Process at most N locations")
        parser.add_argument("--delay", type=float, default=MIN_DELAY,
                            help=f"Seconds between requests (minimum {MIN_DELAY})")
        parser.add_argument("--dry-run", action="store_true", help="Fetch and report without writing")
        parser.add_argument("--only-missing", action="store_true",
                            help="Skip locations that already belong to a water zone")

    def handle(self, *args, **options):
        delay = max(options["delay"], MIN_DELAY)
        self.dry_run = dry_run = options["dry_run"]
        qs = (Location.active.exclude(building_number="").exclude(street_number="")
              .select_related("neighborhood", "water_zone").order_by("id"))
        if options["only_missing"]:
            qs = qs.filter(water_zone__isnull=True)
        if options["limit"]:
            qs = qs[:options["limit"]]
        locations = list(qs)

        w = self.stdout.write
        w(self.style.MIGRATE_HEADING(f"Fetching water schedules for {len(locations)} location(s)"
                                     f"{' (dry run)' if dry_run else ''}, {delay:.1f}s between requests"))
        self.stats = stats = {
            "processed": 0, "zones_matched": 0, "zones_created": 0, "locations_assigned": 0,
            "already_in_zone": 0, "no_schedule": 0, "unparsed": 0, "neighborhoods_linked": 0,
            "neighborhoods_created": 0, "failed": 0,
        }
        self.neighborhoods = {name_key(n.name): n for n in Neighborhood.objects.all()}
        self.zone_index = {}  # neighborhood key -> {"by_signature": {...}, "codes": set(), "names": set()}
        client = GazaCityClient()

        for index, location in enumerate(locations):
            if index:
                time.sleep(delay)
            label = f"#{location.pk} {location.place_name} ({location.building_number}/{location.street_number})"
            try:
                info = parse_building_info(client.building_info(location.building_number, location.street_number))
                stats["processed"] += 1
                with transaction.atomic():
                    outcome = self._apply(location, info)
                w(f"  {label}: {outcome}")
            except Exception as exc:  # one bad location must never abort the run
                stats["failed"] += 1
                logger.warning("fetch_water_schedules failed for location %s: %s", location.pk, exc)
                self.stderr.write(f"  {label}: FAILED ({exc})")

        if not dry_run:
            log_action(AuditLog.Action.IMPORT, entity_type="waterzone", username="fetch_water_schedules",
                       after={"source": BUILDING_INFO_URL, **stats})
        w(self.style.MIGRATE_HEADING("Summary"))
        for key, value in stats.items():
            w(f"  {key + ':':<24}{value}")
        if dry_run:
            w(self.style.WARNING("Dry run - nothing written."))

    # -- neighborhoods -----------------------------------------------------------------
    def _neighborhood(self, name, parts):
        """Existing neighborhood matched by name_key, or a new one (None in a dry run)."""
        key = name_key(name)
        if key in self.neighborhoods:
            return key, self.neighborhoods[key]
        self.stats["neighborhoods_created"] += 1
        parts.append(f"new neighborhood «{name}»")
        neighborhood = None
        if not self.dry_run:
            top = Neighborhood.objects.aggregate(m=Max("sort_order"))["m"] or 0
            neighborhood = Neighborhood.objects.create(name=clean_text(name)[:120], sort_order=top + 1)
        self.neighborhoods[key] = neighborhood
        return key, neighborhood

    # -- zones -------------------------------------------------------------------------
    def _zones_of(self, key, neighborhood):
        if key not in self.zone_index:
            entry = {"by_signature": {}, "codes": set(), "names": set()}
            if neighborhood is not None:
                for zone in WaterZone.objects.filter(neighborhood=neighborhood).prefetch_related("slots"):
                    entry["by_signature"].setdefault(signature(zone.slots.all()), zone)
                    entry["codes"].add(zone.code.upper())
                    entry["names"].add(name_key(zone.name))
            self.zone_index[key] = entry
        return self.zone_index[key]

    def _zone_for(self, key, neighborhood, slots, parts):
        """The zone of this neighborhood with exactly these windows, created (next letter) if missing."""
        entry = self._zones_of(key, neighborhood)
        sig = signature(slots)
        zone = entry["by_signature"].get(sig)
        if zone is not None:
            self.stats["zones_matched"] += 1
            return zone
        code = next_free_code(entry["codes"], entry["names"], key=name_key)
        name = default_zone_name(code)
        self.stats["zones_created"] += 1
        parts.append(f"new zone «{name}»")
        zone = name  # placeholder in a dry run
        if not self.dry_run:
            top = WaterZone.objects.filter(neighborhood=neighborhood).aggregate(m=Max("sort_order"))["m"] or 0
            zone = WaterZone.objects.create(neighborhood=neighborhood, name=name, code=code, sort_order=top + 1)
            notes = {}
            for s in slots:
                window = (s.day, s.start_time, s.end_time)
                notes[window] = notes.get(window) or s.note
            WaterSlot.objects.bulk_create([
                WaterSlot(zone=zone, day=day, start_time=start, end_time=end, note=note,
                          source=WaterSlot.Source.GAZA_CITY)
                for (day, start, end), note in sorted(notes.items())
            ])
        entry["by_signature"][sig] = zone
        entry["codes"].add(code)
        entry["names"].add(name_key(name))
        return zone

    def _apply(self, location, info):
        parts = []
        stats = self.stats
        key, neighborhood = None, location.neighborhood
        if info.neighborhood:
            key, neighborhood = self._neighborhood(info.neighborhood, parts)
            if neighborhood is None or location.neighborhood_id != neighborhood.pk:
                stats["neighborhoods_linked"] += 1
                parts.append(f"الحي={info.neighborhood}")
                if not self.dry_run:
                    location.neighborhood = neighborhood
                    location.save(update_fields=["neighborhood", "updated_at"])

        if info.slots:
            if key is None:
                if neighborhood is not None:
                    key = name_key(neighborhood.name)
                else:
                    key, neighborhood = self._neighborhood(UNKNOWN_NEIGHBORHOOD, parts)
            zone = self._zone_for(key, neighborhood, info.slots, parts)
            parts.append(", ".join(f"{DAY_LABELS[s.day]} {s.start_time:%H:%M}-{s.end_time:%H:%M}"
                                   for s in info.slots))
            if isinstance(zone, WaterZone) and location.water_zone_id == zone.pk:
                stats["already_in_zone"] += 1
                parts.append(f"already in «{zone.name}»")
            else:
                stats["locations_assigned"] += 1
                parts.append(f"-> «{zone if isinstance(zone, str) else zone.name}»")
                if not self.dry_run:
                    location.water_zone = zone
                    location.neighborhood = zone.neighborhood
                    location.save(update_fields=["water_zone", "neighborhood", "updated_at"])
        elif info.no_schedule:
            stats["no_schedule"] += 1
            parts.append("no schedule (zone unchanged)")
        else:
            stats["unparsed"] += 1
            parts.append("schedule not found in response (zone unchanged)")
        if info.skipped_rows:
            parts.append(f"{len(info.skipped_rows)} unreadable row(s) skipped")
        return "; ".join(parts)
