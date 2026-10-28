"""
Builds frontend/src/data/gazaNeighborhoods.json from «خريطة مدينة غزة.pdf» (a vector map): the
neighborhood polygons (from the thick black boundary lines) named by the big labels, placed on the real
map (latitude / longitude) for the water page's «الخريطة». The paper map is turned 51° so north points
up, then fitted to the real map (see «onto the real map» below).

    pip install pymupdf shapely
    python frontend/scripts/build_gaza_map.py "<path to خريطة مدينة غزة.pdf>"
"""
import json
import math
import sys
import unicodedata
from pathlib import Path

import pymupdf
from shapely import affinity
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box
from shapely.ops import polygonize, polylabel, unary_union

PDF = sys.argv[1] if len(sys.argv) > 1 else 'خريطة مدينة غزة.pdf'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'gazaNeighborhoods.json'

doc = pymupdf.open(PDF)
page = doc[0]
drawings = page.get_drawings()

FRAME = None
for d in drawings:
    if d['type'] == 's' and round(d['width'], 2) == 1.92:
        FRAME = d['rect']
frame = box(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1)


def path_points(d, curve_steps=6):
    """The drawing as a list of polylines (lists of (x, y))."""
    lines, current = [], []
    for item in d['items']:
        op = item[0]
        if op == 'l':
            a, b = item[1], item[2]
            if current and (abs(current[-1][0] - a.x) > 0.01 or abs(current[-1][1] - a.y) > 0.01):
                lines.append(current)
                current = []
            if not current:
                current.append((a.x, a.y))
            current.append((b.x, b.y))
        elif op == 'c':
            p0, p1, p2, p3 = item[1:5]
            if current and (abs(current[-1][0] - p0.x) > 0.01 or abs(current[-1][1] - p0.y) > 0.01):
                lines.append(current)
                current = []
            if not current:
                current.append((p0.x, p0.y))
            for k in range(1, curve_steps + 1):
                t = k / curve_steps
                x = (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t * t * p2.x + t ** 3 * p3.x
                y = (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t * t * p2.y + t ** 3 * p3.y
                current.append((x, y))
        elif op == 're':
            r = item[1]
            if current:
                lines.append(current)
                current = []
            lines.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)])
        elif op == 'qu':
            q = item[1]
            if current:
                lines.append(current)
                current = []
            lines.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)])
    if current:
        lines.append(current)
    return [l for l in lines if len(l) >= 2]


# ---------------------------------------------------------------- neighborhoods
boundary_lines = []
for d in drawings:
    if d['type'] == 's' and round(d['width'], 2) == 2.04:
        for pts in path_points(d):
            boundary_lines.append(LineString(pts))
boundary_lines.append(frame.exterior)
merged = unary_union(boundary_lines)
faces = [f for f in polygonize(merged) if f.area > 50]

labels = []
for b in page.get_text('rawdict')['blocks']:
    for l in b.get('lines', []):
        for s in l['spans']:
            if s['size'] > 9:
                text = unicodedata.normalize('NFKC', ''.join(ch['c'] for ch in s['chars'])).strip()
                x0, y0, x1, y1 = s['bbox']
                labels.append((text, Point((x0 + x1) / 2, (y0 + y1) / 2)))

neighborhoods = []
used = set()
for text, pt in labels:
    inside = [f for f in faces if f.contains(pt)]
    if not inside:
        inside = sorted(faces, key=lambda f: f.distance(pt))[:1]
    face = inside[0]
    if id(face) in used:
        print('WARNING two labels in one face:', text, file=sys.stderr)
    used.add(id(face))
    neighborhoods.append({'name': text, 'shape': face, 'label': pt})
unlabelled = [f for f in faces if id(f) not in used]
print('faces', len(faces), 'labelled', len(used), 'unlabelled areas', [round(f.area) for f in unlabelled], file=sys.stderr)

city = unary_union([n['shape'] for n in neighborhoods]).buffer(0)

# ---------------------------------------------------------------- turn north up
ANGLE = -math.degrees(math.atan2(0.777, 0.629))  # the labels' slant: ≈ -51°
ORIGIN = (0, 0)


def turn(g):
    return affinity.rotate(g, ANGLE, origin=ORIGIN)


city_t = turn(city)
minx, miny, maxx, maxy = city_t.bounds
PAD = 6
dx, dy = -minx + PAD, -miny + PAD


def place(g):
    return affinity.translate(turn(g), dx, dy)


PRECISION = 1


def fmt(v):
    return ('%.*f' % (PRECISION, v)).rstrip('0').rstrip('.') if PRECISION else str(round(v))


def ring_d(coords):
    pts = list(coords)
    return 'M' + 'L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts[:-1]) + 'Z'


def poly_d(g):
    if g.is_empty:
        return ''
    polys = [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']
    out = []
    for p in polys:
        out.append(ring_d(p.exterior.coords))
        for hole in p.interiors:
            out.append(ring_d(hole.coords))
    return ''.join(out)


def lines_d(g):
    if g.is_empty:
        return ''
    parts = []
    geoms = [g] if g.geom_type == 'LineString' else list(getattr(g, 'geoms', []))
    for line in geoms:
        if line.geom_type != 'LineString':
            continue
        pts = list(line.coords)
        parts.append('M' + 'L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts))
    return ''.join(parts)


# ---------------------------------------------------------------- onto the real map
# Similarity transform map units → metres east / south of (31.51 N, 34.45 E), found by placing the 110
# database locations that have coordinates inside their own neighborhood (all 110 fit; then centred so
# they sit as far as possible from the edges: median 134 m inside). Accuracy: a few tens of metres.
GEO_SCALE, GEO_TURN, GEO_TX, GEO_TY = 8.132109668945926, 0.0008017465530657793, -4918.274156858555, -4161.444175352239
LAT0, LON0 = 31.51, 34.45
M_PER_DEG_LON = math.cos(math.radians(LAT0)) * 111320.0
M_PER_DEG_LAT = 110574.0


def to_lat_lon(x, y):
    c, sn = math.cos(GEO_TURN), math.sin(GEO_TURN)
    X = GEO_SCALE * (c * x - sn * y) + GEO_TX
    Y = GEO_SCALE * (sn * x + c * y) + GEO_TY
    return [round(LAT0 - Y / M_PER_DEG_LAT, 6), round(LON0 + X / M_PER_DEG_LON, 6)]


def rings(g):
    polys = [g] if g.geom_type == 'Polygon' else [p for p in g.geoms if p.geom_type == 'Polygon']
    return [[to_lat_lon(x, y) for x, y in list(p.exterior.coords)[:-1]] for p in polys]


data = {
    'source': 'خريطة مدينة غزة (PDF) - بلدية غزة',
    'neighborhoods': [],
}
for n in neighborhoods:
    shape = place(n['shape']).simplify(0.3, preserve_topology=True)
    biggest = shape if shape.geom_type == 'Polygon' else max(shape.geoms, key=lambda g: g.area)
    lp = polylabel(biggest, tolerance=1)  # the name at the visual centre
    data['neighborhoods'].append({
        'name': n['name'],
        'rings': rings(shape),
        'label': to_lat_lon(lp.x, lp.y),
        'area': round(shape.area * GEO_SCALE * GEO_SCALE),  # m²
    })
data['neighborhoods'].sort(key=lambda n: -n['area'])
# the city's outline (all the neighborhoods together, gaps between their lines closed): the map
# greys out everything outside it
city_shape = unary_union([place(n['shape']).buffer(0.6) for n in neighborhoods]).buffer(-0.6).simplify(0.3, preserve_topology=True)
data['city'] = rings(city_shape)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('size KB', round(len(json.dumps(data, ensure_ascii=False)) / 1024), file=sys.stderr)
print([n['name'] for n in data['neighborhoods']], file=sys.stderr)
