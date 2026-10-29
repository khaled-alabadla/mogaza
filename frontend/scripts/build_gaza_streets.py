"""
Builds frontend/src/data/gazaStreets.json: the line of every named street of Gaza City on OpenStreetMap,
so the map can light up the whole street that was searched for (the search box finds streets in
gazaPlaces.json; this file only draws them, and is downloaded the first time a street is picked).

    python frontend/scripts/build_gaza_streets.py           (needs: pip install shapely; internet)

The file is { "streets": { name: [[[lat, lng], ...], ...] } } — a street is drawn in several pieces.
"""
import json
import sys

from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge

from build_gaza_places import OUT as PLACES_OUT, city, east, fetch_elements, name_of, north, south, west
import build_gaza_places

OUT = PLACES_OUT.with_name('gazaStreets.json')
build_gaza_places.QUERY = f'[out:json][timeout:120];way["highway"]["name"]({south},{west},{north},{east});out geom tags;'
SIMPLIFY = 0.00003  # ~3 m: the line stays on the street, the file stays small


def main():
    pieces = {}
    for e in fetch_elements():
        name = name_of(e.get('tags', {}))
        points = [(p['lon'], p['lat']) for p in e.get('geometry', [])]
        if not name or len(points) < 2:
            continue
        line = LineString(points).intersection(city)
        if line.is_empty:
            continue
        pieces.setdefault(name, []).extend(getattr(line, 'geoms', [line]))

    streets = {}
    for name, lines in pieces.items():
        merged = linemerge(MultiLineString([l for l in lines if l.geom_type == 'LineString']))
        parts = [g.simplify(SIMPLIFY) for g in getattr(merged, 'geoms', [merged])]
        streets[name] = [[[round(lat, 5), round(lng, 5)] for lng, lat in p.coords] for p in parts if len(p.coords) > 1]
    streets = {k: v for k, v in sorted(streets.items()) if v}
    OUT.write_text(json.dumps({'source': 'OpenStreetMap', 'streets': streets}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(streets), 'streets;', round(OUT.stat().st_size / 1024), 'KB', file=sys.stderr)


if __name__ == '__main__':
    main()
