"""
Small geography helpers used to describe water zones in words people understand
(«شرق دوار حيدر», «محيط مفترق الشعبية») instead of letters.

Pure functions only (no database access) so they are easy to test.
"""
import json
import math
import re
from dataclasses import dataclass

from apps.locations.text import clean_text, name_key

# Place names that people use as reference points.
LANDMARK_PREFIXES = ("دوار", "مفترق", "مفترف", "ميدان", "جسر")
# Closer than this, the zone is "around" the landmark rather than in a direction from it.
NEAR_METERS = 120
# Farther than this, a landmark is not a useful reference; fall back to a building name.
MAX_LANDMARK_METERS = 1500

DIRECTIONS = ["شمال", "شمال شرق", "شرق", "جنوب شرق", "جنوب", "جنوب غرب", "غرب", "شمال غرب"]

AUTO_NAME_RE = re.compile(r"^منطقة [A-Z]+$")


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


@dataclass(frozen=True)
class Landmark:
    name: str
    point: Point


def geojson_centroid(text):
    """Mean of the outer-ring vertices of the first feature in a GeoJSON FeatureCollection, or None."""
    try:
        data = json.loads(text)
        geometry = data["features"][0]["geometry"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    coords = geometry.get("coordinates")
    kind = geometry.get("type")
    if kind == "Point":
        ring = [coords]
    elif kind == "Polygon":
        ring = coords[0]
    elif kind == "MultiPolygon":
        ring = coords[0][0]
    else:
        return None
    points = [(float(p[0]), float(p[1])) for p in ring if len(p) >= 2]
    if not points:
        return None
    lon = sum(p[0] for p in points) / len(points)
    lat = sum(p[1] for p in points) / len(points)
    # Sanity check: the Gaza Strip.
    if not (31.0 < lat < 31.8 and 34.0 < lon < 34.8):
        return None
    return Point(round(lat, 6), round(lon, 6))


def mean_point(points):
    points = [p for p in points if p is not None]
    if not points:
        return None
    return Point(sum(p.lat for p in points) / len(points), sum(p.lon for p in points) / len(points))


def _offset_meters(origin, target):
    dx = (target.lon - origin.lon) * 111_320 * math.cos(math.radians(origin.lat))
    dy = (target.lat - origin.lat) * 110_540
    return dx, dy


def distance_m(a, b):
    dx, dy = _offset_meters(a, b)
    return math.hypot(dx, dy)


def direction_word(origin, target):
    """8-point compass direction (Arabic) of `target` as seen from `origin`."""
    dx, dy = _offset_meters(origin, target)
    angle = math.degrees(math.atan2(dx, dy)) % 360  # 0 = north, clockwise
    return DIRECTIONS[int((angle + 22.5) // 45) % 8]


def is_landmark_name(place_name):
    return clean_text(place_name).startswith(LANDMARK_PREFIXES)


def describe_zone(center, landmarks, taken, fallback_names=()):
    """
    A descriptive zone name, unique (by name_key) against `taken`:
      «محيط <landmark>» when very close, «<direction> <landmark>» otherwise, using the nearest landmarks
      first; falls back to «محيط <building>» from `fallback_names`. Returns None if nothing fits.
    """
    taken_keys = {name_key(t) for t in taken}
    candidates = []
    if center is not None:
        for landmark in sorted(landmarks, key=lambda lm: distance_m(lm.point, center)):
            distance = distance_m(landmark.point, center)
            if distance > MAX_LANDMARK_METERS:
                break
            if distance <= NEAR_METERS:
                candidates.append(f"محيط {landmark.name}")
            else:
                candidates.append(f"{direction_word(landmark.point, center)} {landmark.name}")
            if len(candidates) >= 6:
                break
    candidates += [f"محيط {clean_text(n)}" for n in fallback_names if clean_text(n)]
    for name in candidates:
        name = name[:120]
        if name_key(name) not in taken_keys:
            return name
    return None
