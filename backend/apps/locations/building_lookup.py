"""
«الخريطة»: where a building is, from its building + street numbers, for numbers the site doesn't know.

    GET /api/locations/find-building/?building=8&street=1786
        → {"found": true, "latitude": 31.5…, "longitude": 34.4…, "building_number": "8", "street_number": "1786",
           "location": {…} | null}

One of the site's locations with these numbers (and coordinates) answers at once. Otherwise the building is
looked up in the background in the municipality GIS (the same request as the city map's building search) —
one request per search, remembered for a day (a miss for an hour), at most LIMIT per user per minute.
The answer never says where it came from. Read: search.view.
"""
import logging
import re

from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import SearchPermission
from apps.locations.text import ascii_digits, clean_text

from .models import Location

log = logging.getLogger(__name__)

NUMBER = re.compile(r"^[0-9A-Za-z\-/]{1,20}$")
FOUND_FOR = 24 * 3600  # seconds a found building is remembered
MISSED_FOR = 3600  # seconds a missing one is
LIMIT = 30  # lookups per user per minute
TIMEOUT = 5  # seconds to wait for each request (the serverless function must answer well within its limit)
BAD_NUMBERS = "أدخل رقم المبنى ورقم الشارع."
UNAVAILABLE = "تعذر البحث عن المبنى الآن، حاول بعد قليل."
TOO_MANY = "عمليات بحث كثيرة، حاول بعد دقيقة."


def lookup_building(building, street):
    """(lat, lng) of the building in the municipality GIS, or None when it has no such building."""
    from apps.water.geo import geojson_centroid
    from apps.water.management.commands.fetch_water_schedules import GazaCityClient

    point = geojson_centroid(GazaCityClient(timeout=TIMEOUT).building_geojson(building, street))
    return (point.lat, point.lon) if point else None


class FindBuildingView(APIView):
    permission_classes = [SearchPermission]

    def get(self, request):
        building = clean_text(ascii_digits(request.query_params.get("building", ""))).upper()
        street = clean_text(ascii_digits(request.query_params.get("street", ""))).upper()
        if not (NUMBER.match(building) and NUMBER.match(street)):
            return Response({"detail": BAD_NUMBERS}, status=status.HTTP_400_BAD_REQUEST)
        answer = {"building_number": building, "street_number": street}

        # one of ours: no lookup needed
        known = (Location.active.filter(building_number__iexact=building, street_number__iexact=street,
                                        latitude__isnull=False).select_related("neighborhood").first())
        if known:
            return Response({**answer, "found": True, "latitude": float(known.latitude),
                             "longitude": float(known.longitude),
                             "location": {"id": known.pk, "place_name": known.place_name,
                                          "neighborhood_name": known.neighborhood.name if known.neighborhood_id else None}})

        key = f"find-building:{building}:{street}"
        remembered = cache.get(key)
        if remembered is None:
            who = f"find-building-count:{request.user.pk or request.META.get('REMOTE_ADDR')}"
            cache.add(who, 0, 60)
            try:
                count = cache.incr(who)
            except ValueError:  # expired meanwhile
                cache.set(who, 1, 60)
                count = 1
            if count > LIMIT:
                return Response({"detail": TOO_MANY}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            try:
                point = lookup_building(building, street)
            except Exception:  # the GIS is down / slow: say so, don't remember
                log.warning("building lookup failed for %s/%s", building, street, exc_info=True)
                return Response({"detail": UNAVAILABLE}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            remembered = list(point) if point else []
            cache.set(key, remembered, FOUND_FOR if point else MISSED_FOR)

        if not remembered:
            return Response({**answer, "found": False})
        return Response({**answer, "found": True, "latitude": remembered[0], "longitude": remembered[1], "location": None})
