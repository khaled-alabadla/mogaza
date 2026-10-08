"""
Pure helpers for water zones (no database access), shared by the v2 data migration,
the API and the fetch_water_schedules command.

A schedule *signature* is the sorted tuple of distinct (day, start_time, end_time):
notes are ignored and duplicate rows collapse, so two buildings with the same windows
get the same signature and therefore belong to the same zone.
"""
from collections import defaultdict
from string import ascii_uppercase

UNKNOWN_NEIGHBORHOOD = "غير محدد"


def zone_code(index):
    """0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB" ... (spreadsheet-style column letters)."""
    code = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        code = ascii_uppercase[rem] + code
    return code


def default_zone_name(code):
    return f"منطقة {code}"


def next_free_code(used_codes, used_name_keys=(), key=lambda name: name):
    """
    First code (A, B, ...) not already used in a neighborhood. `used_name_keys` holds the
    comparison keys of existing zone names so the default name «منطقة X» never collides either.
    """
    used = {str(c).strip().upper() for c in used_codes if c}
    names = set(used_name_keys)
    index = 0
    while True:
        code = zone_code(index)
        if code not in used and key(default_zone_name(code)) not in names:
            return code
        index += 1


def signature(slots):
    """slots: iterable of objects with day/start_time/end_time, or of (day, start, end[, ...]) tuples."""
    items = set()
    for slot in slots:
        if isinstance(slot, (tuple, list)):
            items.add((slot[0], slot[1], slot[2]))
        else:
            items.add((slot.day, slot.start_time, slot.end_time))
    return tuple(sorted(items))


def plan_zones(locations):
    """
    Group buildings into zones.

    `locations`: iterable of (location_id, neighborhood_key, slots) where slots is a list of
    (day, start_time, end_time, note, source). neighborhood_key may be None (no neighborhood).

    Returns {neighborhood_key: [zone, ...]} where zone = {"code", "name", "sort_order", "signature",
    "location_ids", "slots": [(day, start, end, note, source), ...]}. Inside a neighborhood the zones are
    ordered by number of buildings (desc), ties by earliest day/time, and lettered A, B, C ...
    """
    groups = defaultdict(lambda: {"location_ids": [], "rows": []})
    for location_id, neighborhood_key, slots in locations:
        if not slots:
            continue
        group = groups[(neighborhood_key, signature(slots))]
        group["location_ids"].append(location_id)
        group["rows"].extend(slots)

    by_neighborhood = defaultdict(list)
    for (neighborhood_key, sig), group in groups.items():
        by_neighborhood[neighborhood_key].append((sig, group))

    plan = {}
    for neighborhood_key, items in by_neighborhood.items():
        items.sort(key=lambda item: (-len(item[1]["location_ids"]), item[0]))
        zones = []
        for index, (sig, group) in enumerate(items):
            code = zone_code(index)
            zones.append({
                "code": code,
                "name": default_zone_name(code),
                "sort_order": index + 1,
                "signature": sig,
                "location_ids": sorted(group["location_ids"]),
                "slots": [_merge_rows(group["rows"], window) for window in sig],
            })
        plan[neighborhood_key] = zones
    return plan


def _merge_rows(rows, window):
    """One slot for a (day, start, end) window: first non-empty note; source "gaza-city.org" if mixed."""
    matching = [row for row in rows if (row[0], row[1], row[2]) == window]
    note = next((row[3] for row in matching if row[3]), "")
    sources = {row[4] for row in matching}
    source = sources.pop() if len(sources) == 1 else "gaza-city.org"
    return (window[0], window[1], window[2], note, source)
