"""
Builds frontend/src/data/gazaPlaces.json: every named place, street and landmark of Gaza City on
OpenStreetMap, for the map's search box (searched in the browser: any part of a name, instantly).

    python frontend/scripts/build_gaza_places.py            (needs: pip install shapely; internet)

Run it again from time to time to pick up what was added to OpenStreetMap since.
Each place is [name, kind, lat, lng] (a street: its middle; long streets also get [south, west, north, east]).
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'src' / 'data' / 'gazaPlaces.json'
CITY = json.loads((HERE.parent / 'src' / 'data' / 'gazaNeighborhoods.json').read_text(encoding='utf-8'))['city']
# the main Overpass server, then a mirror (they are busy at times)
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

city = unary_union([Polygon([(lng, lat) for lat, lng in ring]) for ring in CITY]).buffer(0.0015)  # ~150 m margin
south, west, north, east = city.bounds[1], city.bounds[0], city.bounds[3], city.bounds[2]

QUERY = f'[out:json][timeout:120];nwr["name"]({south},{west},{north},{east});out center tags;'

# what a place is, in Arabic (the first matching tag wins)
KINDS = [
    (('amenity', 'place_of_worship'), lambda t: 'كنيسة' if t.get('religion') == 'christian' else 'مسجد'),
    (('amenity', 'school'), 'مدرسة'), (('amenity', 'kindergarten'), 'روضة أطفال'),
    (('amenity', 'university'), 'جامعة'), (('amenity', 'college'), 'كلية'),
    (('amenity', 'hospital'), 'مستشفى'), (('amenity', 'clinic'), 'عيادة'), (('amenity', 'doctors'), 'عيادة'),
    (('amenity', 'dentist'), 'عيادة أسنان'), (('amenity', 'pharmacy'), 'صيدلية'),
    (('amenity', 'bank'), 'بنك'), (('amenity', 'atm'), 'صراف آلي'), (('amenity', 'bureau_de_change'), 'صرافة'),
    (('amenity', 'restaurant'), 'مطعم'), (('amenity', 'fast_food'), 'مطعم'), (('amenity', 'cafe'), 'مقهى'),
    (('amenity', 'fuel'), 'محطة وقود'), (('amenity', 'police'), 'شرطة'), (('amenity', 'fire_station'), 'دفاع مدني'),
    (('amenity', 'townhall'), 'مبنى حكومي'), (('amenity', 'courthouse'), 'محكمة'), (('amenity', 'post_office'), 'بريد'),
    (('amenity', 'community_centre'), 'مركز مجتمعي'), (('amenity', 'library'), 'مكتبة'),
    (('amenity', 'marketplace'), 'سوق'), (('amenity', 'parking'), 'موقف سيارات'), (('amenity', 'bus_station'), 'موقف'),
    (('amenity', 'social_facility'), 'مؤسسة اجتماعية'), (('amenity', 'grave_yard'), 'مقبرة'),
    (('landuse', 'cemetery'), 'مقبرة'), (('amenity', None), 'مرفق'),
    (('shop', 'supermarket'), 'سوبرماركت'), (('shop', 'bakery'), 'مخبز'), (('shop', 'mall'), 'مجمع تجاري'),
    (('shop', None), 'محل'),
    (('leisure', 'park'), 'حديقة'), (('leisure', 'stadium'), 'ملعب'), (('leisure', 'pitch'), 'ملعب'),
    (('leisure', 'sports_centre'), 'نادي رياضي'), (('leisure', None), 'مرفق ترفيهي'),
    (('tourism', 'hotel'), 'فندق'), (('tourism', 'museum'), 'متحف'), (('tourism', None), 'معلم'),
    (('historic', None), 'معلم أثري'), (('healthcare', None), 'مركز صحي'),
    (('office', 'government'), 'مؤسسة حكومية'), (('office', 'ngo'), 'مؤسسة'), (('office', None), 'مكتب'),
    (('place', None), 'منطقة'), (('junction', None), 'مفترق'),
    (('highway', 'traffic_signals'), 'إشارة مرور'), (('highway', 'bus_stop'), 'موقف'),
    (('highway', None), 'شارع'), (('building', None), 'مبنى'), (('landuse', None), 'منطقة'),
    (('man_made', None), 'منشأة'), (('craft', None), 'ورشة'),
]


def kind_of(tags):
    for (key, value), label in KINDS:
        if key in tags and (value is None or tags[key] == value):
            return label(tags) if callable(label) else label
    return 'مكان'


def arabic(text):
    return any('؀' <= ch <= 'ۿ' for ch in text)


def name_of(tags):
    """The Arabic name when there is one (name:ar, else an Arabic name), else the name as written."""
    for key in ('name:ar', 'name'):
        if tags.get(key) and arabic(tags[key]):
            return tags[key].strip()
    return (tags.get('name') or '').strip()


def fetch_elements():
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    last = None
    for attempt in range(3):
        for url in OVERPASS:
            try:
                request = urllib.request.Request(url, data=body, headers={'User-Agent': 'gaza-municipality-info-dept/1.0'})
                return json.load(urllib.request.urlopen(request, timeout=180))['elements']
            except Exception as error:  # busy / timed out: try the next server, then again
                last = error
                print(f'{url}: {error}', file=sys.stderr)
        time.sleep(10 * (attempt + 1))
    raise SystemExit(f'Overpass did not answer: {last}')


def main():
    elements = fetch_elements()

    places, streets = [], {}
    for e in elements:
        tags = e.get('tags', {})
        name = name_of(tags)
        lat, lng = (e.get('lat'), e.get('lon')) if e['type'] == 'node' else (e.get('center', {}).get('lat'), e.get('center', {}).get('lon'))
        if not name or lat is None or not city.contains(Point(lng, lat)):
            continue
        kind = kind_of(tags)
        if kind == 'شارع':
            # a street is drawn in many pieces: one result per name, around all of them
            s = streets.setdefault(name, {'lats': [], 'lngs': []})
            s['lats'].append(lat)
            s['lngs'].append(lng)
            continue
        places.append([name, kind, round(lat, 6), round(lng, 6)])

    for name, s in streets.items():
        lat = sum(s['lats']) / len(s['lats'])
        lng = sum(s['lngs']) / len(s['lngs'])
        row = [name, 'شارع', round(lat, 6), round(lng, 6)]
        if len(s['lats']) > 1:
            row.append([round(min(s['lats']), 5), round(min(s['lngs']), 5), round(max(s['lats']), 5), round(max(s['lngs']), 5)])
        places.append(row)

    # one entry per name + kind + spot (OpenStreetMap sometimes has a place twice)
    seen, unique = set(), []
    for row in places:
        key = (row[0], row[1], round(row[2], 4), round(row[3], 4))
        if key not in seen:
            seen.add(key)
            unique.append(row)
    unique.sort(key=lambda r: r[0])
    OUT.write_text(json.dumps({'source': 'OpenStreetMap', 'places': unique}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(unique), 'places;', round(OUT.stat().st_size / 1024), 'KB', file=sys.stderr)


if __name__ == '__main__':
    main()
