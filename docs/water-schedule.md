# جدول المياه — Water schedule feature (spec / API contract)

> **v2 (current): schedules belong to WATER ZONES, not to individual buildings.** Sections marked
> "v1" further down describe the first, per-building version and are superseded wherever they conflict
> with this v2 section.

## v2 — Water zones (مناطق المياه)

### Why
Analysis of the imported data (90 buildings with schedules) shows water is distributed by supply zones
*inside* each neighborhood: e.g. in الدرج 5 buildings get water Mon+Fri 09:00–12:00 but another gets
Sat+Thu; الرمال الشمالي has 12 distinct schedules. Users want to read the schedule per area:
«الدرج — منطقة A: الاثنين والجمعة 09:00–12:00»، «منطقة B: …», and edit it once for all its buildings.

### Data model (backend/apps/water)
```
Neighborhood  (unchanged)
WaterZone     id, neighborhood FK (PROTECT, related_name="zones"), name (varchar 120, e.g. "منطقة A"),
              code (varchar 10, e.g. "A"), note (varchar 300, blank), sort_order (int),
              created_at, updated_at
              unique (neighborhood, name)          ordering: neighborhood.sort_order, neighborhood.name, sort_order, name
WaterSlot     zone FK (CASCADE, related_name="slots")   <-- replaces the old `location` FK
              day, start_time, end_time, note, source, created_at, updated_at   (same validation as v1)
              unique (zone, day, start_time, end_time)
Location      neighborhood FK (unchanged) + water_zone FK → WaterZone (null, blank, SET_NULL,
              related_name="locations")
```
**Data migration (must preserve the real imported data):** for every active-or-inactive Location that
has v1 slots, compute its signature = sorted set of distinct (day, start, end) (notes ignored, duplicates
dropped). Group locations by (neighborhood, signature) — locations with no neighborhood go into a
neighborhood named «غير محدد» created on demand. Within each neighborhood order groups by number of
locations desc (tie → earliest day/time), assign codes A, B, C… (after Z: AA, AB…), create WaterZone
name «منطقة A», create its slots once (source copied from the old rows; if mixed use "gaza-city.org"),
set `location.water_zone`. Then drop the old `location` FK. Location.neighborhood is set to the zone's
neighborhood if it was empty. Write it as RunPython with a reverse that is a no-op (or best-effort).

### Rules
* A location's effective schedule = its zone's slots. A location's neighborhood should equal its zone's
  neighborhood: when `water_zone` is set via the API and the location has no/other neighborhood, the
  backend sets `neighborhood = zone.neighborhood`.
* Deleting a zone: allowed for admin/editor; its locations get `water_zone = NULL` (SET_NULL); slots cascade.
  Deleting a neighborhood that still has zones or locations → 400 (Arabic detail).
* Every write audit-logged (entity_type "waterzone" for zones).

### API (v2)
**Zones — `/api/water-zones/`** (read: LocationPermission semantics; write: admin/editor)
* `GET` list, **paginated** (page_size default 50). Filters: `neighborhood=<id>`, `day=0..6` (zones having a slot
  that day), `search=<text>` (Arabic-normalized match on zone name, neighborhood name, or the place_name /
  building_number / street_number of any active location in the zone). Ordering as model.
  Item:
  ```json
  { "id": 7, "name": "منطقة A", "code": "A", "note": "", "sort_order": 1,
    "neighborhood": 9, "neighborhood_name": "الدرج",
    "display_name": "الدرج — منطقة A",
    "slots": [ {"id": 1, "day": 2, "day_display": "الاثنين", "start_time": "09:00", "end_time": "12:00", "note": ""} ],
    "schedule_text": "الاثنين، الجمعة 09:00–12:00",
    "days": [2, 6],
    "locations_count": 5 }
  ```
  (`days` = sorted distinct days; `schedule_text` groups days sharing identical start/end, groups joined with " · ",
  days in week order joined with "، ", times "HH:MM–HH:MM" with an en dash.)
* `GET /api/water-zones/{id}/` same item **plus** `"locations": [{id, place_name, description, building_number,
  street_number}]` (active locations, ordered by place_name).
* `POST` / `PUT` / `PATCH` body: `{name, neighborhood, note?, sort_order?, code?, slots?: [{day,start_time,end_time,note}]}`
  — when `slots` is present it atomically replaces all slots. Validation errors in Arabic; duplicate name inside the
  same neighborhood → 400 `{"name": ["يوجد منطقة بهذا الاسم في نفس الحي."]}`. If `code` omitted on create,
  auto-assign the next free letter in that neighborhood and default `name` to «منطقة <code>» when name is blank.
* `DELETE` → 204 (locations unassigned).
* `POST /api/water-zones/{id}/assign/` body `{"location_ids": [1,2,3]}` → sets their water_zone (and neighborhood)
  → returns zone detail. `POST /api/water-zones/{id}/unassign/` same body → sets water_zone NULL.
* `GET /api/water-zones/summary/` → `{ "today", "today_display", "days": [{day, label, count}] }` where count = number of
  zones with a slot that day (respecting optional `neighborhood` filter), plus `"zones_count"`, `"locations_count"`
  (locations with a zone).

**Locations (v2 changes)**
* Read: `water_zone` (id|null, **writable**), `water_zone_name` (display_name|null), `water_schedule` (zone slots,
  same item shape as v1, [] if no zone), `water_schedule_text` (zone schedule_text or "").
* Filters: `?neighborhood=`, `?water_zone=<id>`, `?has_schedule=1` (= has a zone with ≥1 slot).
* **Removed:** `PUT /api/locations/{id}/water-schedule/` and `/api/water-schedules/` (+ its summary). Delete them and
  their tests (replace with zone tests).

**Neighborhoods:** add `zones_count` to each item; `scheduled_count` = active locations having a zone with slots.

**fetch_water_schedules (v2):** after parsing a building's slots, find a zone in that building's neighborhood whose
slot signature equals the parsed one → assign; else create the next lettered zone with those slots; assign the
location. "No schedule" pages leave the location's zone unchanged. Same rate limit / safety as v1.

### UI (v2) — page «جدول المياه» (/water)
* Two views via a segmented control: **«الجدول الأسبوعي»** (default) and **«حسب اليوم»**.
  * الجدول الأسبوعي: neighborhood filter + search; for each neighborhood a card with a table:
    rows = zones («منطقة A» + buildings count), columns = السبت…الجمعة; a cell shows the time window(s) for that day
    (green tinted cell) or empty; today's column highlighted. On mobile (<640px) render each zone as a stacked card
    instead: zone name, `schedule_text`, day chips (7 chips, active days filled).
  * حسب اليوم: day tabs (today pre-selected, counts from summary) → zones that get water that day grouped by
    neighborhood, each showing time window(s) and buildings count.
* Clicking a zone (both views) opens a **zone details modal**: display_name, schedule (days + times), note,
  list of its buildings (name, description, numbers). Editors see in that modal: «تعديل المنطقة» (name, note,
  neighborhood, slots via the existing WaterScheduleEditor adapted to edit a zone), «حذف المنطقة» (ConfirmDialog:
  «هل أنت متأكد من حذف هذه المنطقة؟ ستبقى المباني بدون منطقة مياه.»), «إضافة مبانٍ» (search locations by text →
  checkbox list → assign) and a remove (unassign) button per building.
* Editors: «منطقة جديدة» button (neighborhood select, name defaulted, slots) and «إدارة الأحياء» (existing).
* Dashboard LocationCard: chip «الحي» + line «💧 الدرج — منطقة A: الاثنين، الجمعة 09:00–12:00» (from
  water_zone_name + water_schedule_text). LocationForm: «منطقة المياه» select (zones of the chosen neighborhood,
  loaded from /api/water-zones/?neighborhood=<id>&page_size=100; empty → null).

## Findings from gaza-city.org/cityMap (analysis)

* The public city map (OpenLayers + MapServer) lets a user click a building. The click runs a WMS
  `GetFeatureInfo` on the `Buildings` layer, then `POST /get_building_info` with
  `building_num`, `street_num`, `sector_nam`, `_token` (Laravel CSRF). The response is an HTML modal
  with tabs: **بيانات المبنى** · **جدول المياه** · حرف المبنى · الحسابات.
* بيانات المبنى contains, among others: `رقم المبنى`, `رقم الشارع`, `قطعة`, `قسيمة`, `الإسم الإعتباري`,
  **`الحي`** (neighborhood, e.g. الدرج / الصبرة / الرمال الشمالي / الشيخ عجلين), `لجنة الحي`, `الرمز البريدي`.
* **جدول المياه is per building**: an HTML table `<tbody id="building_crafts_mod">` with rows
  `اليوم | الوقت | ملاحظة`, e.g. `سبت | 02:00 - 06:00 |` and `ثلاثاء | 02:00 - 06:00 |`.
  Buildings without a schedule show `لا يوجد جدول مياه في هذا المبنى`.
  Day labels seen: سبت، احد، اثنين، ثلاثاء، اربعاء، خميس، جمعة (also أحد/الأحد/الاربعاء variants are possible).
* Observed samples: building 16/1421 (الصبرة) → Sat & Tue 02:00–06:00; 22/1760 (الدرج) → Mon & Fri 09:00–12:00;
  247/2510 (الرمال الشمالي) → Tue & Wed 09:00–12:00; 95/1050 (الشيخ عجلين) → no schedule.
* The city is divided into neighborhoods (see the supplied map): المرابطين، مدينة العودة، البلاخية، مخيم الشاطئ،
  النصر، الشيخ رضوان، الرمال الشمالي، الرمال الجنوبي، الدرج، التفاح، الصبرة، البلدة القديمة، الشيخ عجلين،
  تل الهوى، اجديدة، اجديدة الشرقية، التركمان، التركمان الشرقي، الزيتون، توسعة النفوذ غرب صلاح الدين،
  توسعة النفوذ شرق صلاح الدين.

## Design decisions

* Mirror the source: a schedule belongs to a **Location** (building), and each Location may belong to a
  **Neighborhood** (الحي). PostgreSQL stays the single source of truth; the app never calls gaza-city.org at
  runtime. A separate, optional, rate-limited management command can pull schedules for existing locations.
* Days are stored as integers in the local week order: **0=السبت, 1=الأحد, 2=الاثنين, 3=الثلاثاء, 4=الأربعاء,
  5=الخميس, 6=الجمعة**. "Today" uses `TIME_ZONE` (Asia/Gaza): `(python_weekday + 2) % 7`.
* Times are `HH:MM` (24h). `end_time` may be earlier than `start_time` (overnight window, e.g. 22:00–02:00);
  equal start/end is invalid.
* Permissions are identical to locations: read = authenticated (or anonymous if `PUBLIC_SEARCH_ENABLED`),
  write = admin/editor. Every write is audit-logged.

## Data model (backend/apps/water)

```
Neighborhood   id, name (unique, max 120), sort_order (int, default 0), created_at, updated_at
Location       + neighborhood: FK Neighborhood, null=True, blank=True, on_delete=PROTECT, related_name="locations"
WaterSlot      id, location FK (CASCADE, related_name="water_slots"), day (0..6), start_time (TimeField),
               end_time (TimeField), note (varchar 200, blank), source (varchar 30: "manual" | "gaza-city.org"),
               created_at, updated_at.  ordering: day, start_time
```
A data migration seeds the neighborhood names listed above (sort_order in that order).

## REST API

All list endpoints use the existing pagination (`count/next/previous/results`) unless stated.

### Neighborhoods — `/api/neighborhoods/`
* `GET` → **not paginated**, a plain array ordered by `sort_order, name`:
  `[{ "id", "name", "sort_order", "locations_count", "scheduled_count" }]`
  (`locations_count` = active locations in it; `scheduled_count` = active locations having ≥1 slot)
* `POST {name, sort_order?}` / `PATCH` / `DELETE` → admin/editor. DELETE returns **400** with
  `{"detail": "لا يمكن حذف حي مرتبط بمواقع."}` if active or inactive locations reference it.
  Duplicate name → 400 `{"name": ["هذا الحي موجود مسبقاً."]}`.

### Location payload changes — `/api/locations/…`
Read adds:
```json
"neighborhood": 3,                 // id or null  (also WRITABLE on POST/PUT/PATCH)
"neighborhood_name": "الدرج",       // or null
"water_schedule": [ {"id": 9, "day": 2, "day_display": "الاثنين", "start_time": "09:00",
                      "end_time": "12:00", "note": ""} ]
```
* `GET /api/locations/?neighborhood=<id>` filters; `?has_schedule=1` keeps only locations with slots.

### Replace a location's schedule — `PUT /api/locations/{id}/water-schedule/`
Body `{"slots": [{"day": 0, "start_time": "02:00", "end_time": "06:00", "note": ""}, …]}` (may be empty to clear).
Admin/editor only. Validates each slot (day 0..6, valid HH:MM, start≠end, note ≤200) with Arabic errors,
replaces all slots atomically (`source="manual"`), audit-logs `UPDATE` with before/after `water_schedule`,
returns the full location representation (200).

### Water schedule listing — `GET /api/water-schedules/`
Paginated slots of **active** locations. Filters: `day=0..6`, `neighborhood=<id>`,
`search=<text>` (same Arabic-normalized matching as locations, applied to the location).
Ordering: neighborhood sort_order/name (nulls last), start_time, place_name.
```json
{ "id", "day", "day_display", "start_time", "end_time", "note",
  "location": { "id", "place_name", "description", "building_number", "street_number",
                "neighborhood", "neighborhood_name" } }
```

### Summary — `GET /api/water-schedules/summary/`
```json
{ "today": 2, "today_display": "الاثنين",
  "days": [ {"day": 0, "label": "السبت", "count": 14}, … 7 items ] ,
  "total_locations_with_schedule": 37 }
```
(`count` = number of slots that day for active locations, respecting optional `neighborhood` filter.)

### Import command (optional, never run by the web app)
`python manage.py fetch_water_schedules [--limit N] [--delay 1.0] [--dry-run] [--only-missing]`
For each active location with building+street numbers: POST to gaza-city.org `get_building_info`
(fresh CSRF token from `/cityMap`, cookie jar, ≥1s between requests), parse `الحي` and the
`building_crafts_mod` rows, link/create the Neighborhood (match by Arabic-normalized name), and replace that
location's slots with `source="gaza-city.org"`. Locations whose page says there is no schedule are left
unchanged. Prints a summary. Network failures for one location never abort the run.

## UI (frontend)

* New route **`/water`** — page title **«جدول المياه»**, nav link visible to everyone who can search
  (navbar: «البحث» · «جدول المياه» for all; «المستخدمون» · «سجل العمليات» for admins).
* Day tabs السبت … الجمعة with today pre-selected and badged «اليوم», each tab showing its slot count from
  `/summary/`. Neighborhood filter (select or chips, «كل الأحياء» default). Search box (debounced).
* Results grouped by neighborhood: location name, description, building/street numbers, time window badge(s)
  (`02:00 – 06:00`, LTR-isolated), note. Empty/loading/error states as elsewhere. Pagination.
* Editors/admins: «تعديل المواعيد» per location → modal `WaterScheduleEditor` (rows: day select,
  `<input type="time">` start/end, note; add/remove rows; save via PUT). «إدارة الأحياء» modal to add,
  rename, delete neighborhoods.
* Dashboard `LocationCard`: show a neighborhood chip and a compact water line, e.g.
  «💧 مواعيد المياه: السبت، الثلاثاء 02:00–06:00» (group slots with identical times).
* `LocationForm`: add a «الحي» select (from `/api/neighborhoods/`, optional).
