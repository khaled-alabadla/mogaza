from datetime import date, time
from io import StringIO
from types import SimpleNamespace
from unittest import mock

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.locations.models import Location

from .management.commands import fetch_water_schedules as fetch
from .management.commands.fetch_water_schedules import parse_building_info, parse_csrf_token, parse_day
from .models import Neighborhood, WaterSlot, WaterZone, schedule_text, slot_days
from .zoning import next_free_code, plan_zones, signature, zone_code

N_URL = "/api/neighborhoods/"
Z_URL = "/api/water-zones/"
LOC_URL = "/api/locations/"


def make_user(username, role):
    return User.objects.create_user(username=username, password="S3cure-Pass-2026", role=role)


def make_zone(neighborhood, code, windows, name=None, sort_order=0, note=""):
    zone = WaterZone.objects.create(neighborhood=neighborhood, code=code, name=name or f"منطقة {code}",
                                    sort_order=sort_order, note=note)
    for day, start, end in windows:
        WaterSlot.objects.create(zone=zone, day=day, start_time=start, end_time=end)
    return zone


def slot(day, start, end):
    return SimpleNamespace(day=day, start_time=time(*start), end_time=time(*end))


# ---------------------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------------------
class HelperTests(SimpleTestCase):
    def test_schedule_text_groups_identical_windows(self):
        slots = [slot(6, (9, 0), (12, 0)), slot(2, (9, 0), (12, 0)), slot(0, (22, 0), (2, 0))]
        self.assertEqual(schedule_text(slots), "السبت 22:00–02:00 · الاثنين، الجمعة 09:00–12:00")
        self.assertEqual(slot_days(slots), [0, 2, 6])
        self.assertEqual(schedule_text([]), "")
        # same day with two windows; duplicate rows collapse
        slots = [slot(1, (9, 0), (12, 0)), slot(1, (9, 0), (12, 0)), slot(1, (14, 0), (16, 0))]
        self.assertEqual(schedule_text(slots), "الأحد 09:00–12:00 · الأحد 14:00–16:00")
        self.assertEqual(slot_days(slots), [1])

    def test_zone_codes(self):
        self.assertEqual([zone_code(i) for i in (0, 1, 25, 26, 27, 51, 52)], ["A", "B", "Z", "AA", "AB", "AZ", "BA"])
        self.assertEqual(next_free_code([]), "A")
        self.assertEqual(next_free_code(["a", "B", "D"]), "C")
        # the default name «منطقة C» is taken by a zone with another code -> skip C
        self.assertEqual(next_free_code(["A", "B"], {"منطقة C"}), "D")

    def test_signature_dedupes_and_ignores_notes(self):
        rows = [(1, time(9), time(2), "x", "gaza-city.org"), (1, time(9), time(2), "", "gaza-city.org"),
                (4, time(9), time(2), "", "gaza-city.org")]
        self.assertEqual(signature(rows), ((1, time(9), time(2)), (4, time(9), time(2))))
        self.assertEqual(signature([slot(4, (9, 0), (2, 0)), slot(1, (9, 0), (2, 0))]), signature(rows))

    def test_plan_zones(self):
        sat_tue = [(0, time(2), time(6), "", "gaza-city.org"), (3, time(2), time(6), "", "gaza-city.org")]
        mon_fri = [(2, time(9), time(12), "", "gaza-city.org"), (6, time(9), time(12), "", "gaza-city.org")]
        plan = plan_zones([
            (1, 10, sat_tue),
            (2, 10, mon_fri),
            (3, 10, list(reversed(mon_fri)) + [(2, time(9), time(12), "ضغط", "manual")]),  # duplicate row
            (4, 10, [(1, time(9), time(10), "", "manual")]),
            (5, 20, sat_tue),          # same windows, other neighborhood -> its own zone
            (6, None, mon_fri),        # no neighborhood
            (7, 10, []),               # no slots -> not planned
        ])
        self.assertEqual(set(plan), {10, 20, None})
        zones = plan[10]
        # biggest group first (2 buildings), then ties by earliest window: Sat(0) before Sun(1)
        self.assertEqual([(z["code"], z["name"], z["sort_order"], z["location_ids"]) for z in zones],
                         [("A", "منطقة A", 1, [2, 3]), ("B", "منطقة B", 2, [1]), ("C", "منطقة C", 3, [4])])
        self.assertEqual(zones[0]["slots"], [(2, time(9), time(12), "ضغط", "gaza-city.org"),  # mixed source
                                             (6, time(9), time(12), "", "gaza-city.org")])
        self.assertEqual(zones[2]["slots"], [(1, time(9), time(10), "", "manual")])
        self.assertEqual(plan[20][0]["location_ids"], [5])
        self.assertEqual(plan[None][0]["code"], "A")


# ---------------------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------------------
class WaterTestBase(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", User.Role.ADMIN)
        self.editor = make_user("editor1", User.Role.EDITOR)
        self.viewer = make_user("viewer1", User.Role.VIEWER)
        self.daraj = Neighborhood.objects.get(name="الدرج")
        self.sabra = Neighborhood.objects.get(name="الصبرة")
        self.daraj_a = make_zone(self.daraj, "A", [(2, "09:00", "12:00"), (6, "09:00", "12:00")], sort_order=1)
        self.daraj_b = make_zone(self.daraj, "B", [(0, "09:00", "12:00"), (5, "09:00", "12:00")], sort_order=2)
        self.sabra_a = make_zone(self.sabra, "A", [(0, "02:00", "06:00"), (3, "02:00", "06:00")], sort_order=1)
        self.market = Location.objects.create(place_name="سوق الدرج", building_number="22", street_number="1760",
                                              neighborhood=self.daraj, water_zone=self.daraj_a)
        self.mosque = Location.objects.create(place_name="مسجد الدرج", building_number="23", street_number="1761",
                                              neighborhood=self.daraj, water_zone=self.daraj_a)
        self.school = Location.objects.create(place_name="مدرسة بنات الصبرة", building_number="16",
                                              street_number="1421", neighborhood=self.sabra, water_zone=self.sabra_a)
        self.council = Location.objects.create(place_name="مجلس الوزراء", building_number="95",
                                               street_number="1050")

    def login(self, user=None):
        self.client.force_authenticate(user or self.editor)


class NeighborhoodTests(WaterTestBase):
    def test_seeded_in_spec_order(self):
        names = list(Neighborhood.objects.values_list("name", flat=True))
        self.assertEqual(len(names), 21)
        self.assertEqual((names[0], names[-1]), ("المرابطين", "توسعة النفوذ شرق صلاح الدين"))

    def test_list_unpaginated_with_counts(self):
        Location.objects.create(place_name="محذوف", neighborhood=self.daraj, water_zone=self.daraj_a, is_active=False)
        Location.objects.create(place_name="بدون منطقة", neighborhood=self.daraj)
        make_zone(self.daraj, "C", [])  # a zone without slots does not make its buildings "scheduled"
        self.login(self.viewer)
        res = self.client.get(N_URL)
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.data, list)
        self.assertEqual(len(res.data), 21)
        row = next(r for r in res.data if r["id"] == self.daraj.pk)
        self.assertEqual(set(row), {"id", "name", "sort_order", "locations_count", "scheduled_count", "zones_count"})
        self.assertEqual((row["locations_count"], row["scheduled_count"], row["zones_count"]), (3, 2, 3))
        empty = next(r for r in res.data if r["name"] == "النصر")
        self.assertEqual((empty["locations_count"], empty["scheduled_count"], empty["zones_count"]), (0, 0, 0))

    def test_crud_duplicate_and_audit(self):
        self.login()
        res = self.client.post(N_URL, {"name": "  حي   جديد ", "sort_order": 30})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["name"], res.data["zones_count"]), ("حي جديد", 0))
        pk = res.data["id"]
        self.assertEqual(self.client.patch(f"{N_URL}{pk}/", {"name": "حي معدل"}).data["name"], "حي معدل")
        self.assertEqual(self.client.post(N_URL, {"name": "الدرج"}).data["name"], ["هذا الحي موجود مسبقاً."])
        self.assertEqual(self.client.post(N_URL, {"name": "تل الهوي"}).status_code, 400)  # normalized duplicate
        self.assertEqual(self.client.delete(f"{N_URL}{pk}/").status_code, 204)
        actions = list(AuditLog.objects.filter(entity_type="neighborhood", entity_id=str(pk))
                       .order_by("id").values_list("action", flat=True))
        self.assertEqual(actions, ["CREATE", "UPDATE", "DELETE"])

    def test_protected_delete(self):
        self.login(self.admin)
        res = self.client.delete(f"{N_URL}{self.daraj.pk}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data, {"detail": "لا يمكن حذف حي مرتبط بمواقع."})
        empty_with_zone = Neighborhood.objects.get(name="النصر")
        make_zone(empty_with_zone, "A", [])
        res = self.client.delete(f"{N_URL}{empty_with_zone.pk}/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data, {"detail": "لا يمكن حذف حي يحتوي على مناطق مياه."})

    def test_viewer_cannot_write(self):
        self.login(self.viewer)
        self.assertEqual(self.client.post(N_URL, {"name": "x"}).status_code, 403)
        self.assertEqual(self.client.delete(f"{N_URL}{self.daraj.pk}/").status_code, 403)


class ZoneReadTests(WaterTestBase):
    def setUp(self):
        super().setUp()
        self.login(self.viewer)

    def test_list_item_shape_and_ordering(self):
        res = self.client.get(Z_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 3)
        self.assertEqual([z["display_name"] for z in res.data["results"]],
                         ["الدرج — منطقة A", "الدرج — منطقة B", "الصبرة — منطقة A"])  # الدرج sorts before الصبرة
        item = res.data["results"][0]
        self.assertEqual(list(item), ["id", "name", "code", "note", "sort_order", "neighborhood", "neighborhood_name",
                                      "display_name", "slots", "schedule_text", "days", "locations_count"])
        self.assertEqual(item["slots"][0], {"id": item["slots"][0]["id"], "day": 2, "day_display": "الاثنين",
                                            "start_time": "09:00", "end_time": "12:00", "note": ""})
        self.assertEqual(item["schedule_text"], "الاثنين، الجمعة 09:00–12:00")
        self.assertEqual((item["days"], item["locations_count"], item["neighborhood_name"]), ([2, 6], 2, "الدرج"))
        self.assertNotIn("locations", item)

    def test_pagination_default_50(self):
        for i in range(55):
            make_zone(self.sabra, f"Z{i}", [])
        res = self.client.get(Z_URL)
        self.assertEqual((res.data["count"], len(res.data["results"])), (58, 50))
        self.assertEqual(len(self.client.get(Z_URL, {"page_size": 100}).data["results"]), 58)

    def test_detail_lists_active_locations(self):
        Location.objects.create(place_name="محذوف", water_zone=self.daraj_a, neighborhood=self.daraj, is_active=False)
        res = self.client.get(f"{Z_URL}{self.daraj_a.pk}/")
        self.assertEqual(res.data["locations_count"], 2)
        self.assertEqual(res.data["locations"], [
            {"id": self.market.pk, "place_name": "سوق الدرج", "description": "", "building_number": "22",
             "street_number": "1760"},
            {"id": self.mosque.pk, "place_name": "مسجد الدرج", "description": "", "building_number": "23",
             "street_number": "1761"},
        ])

    def test_filters_and_search(self):
        ids = lambda params: [z["id"] for z in self.client.get(Z_URL, params).data["results"]]  # noqa: E731
        self.assertEqual(ids({"neighborhood": self.daraj.pk}), [self.daraj_a.pk, self.daraj_b.pk])
        self.assertEqual(ids({"day": 0}), [self.daraj_b.pk, self.sabra_a.pk])
        self.assertEqual(ids({"day": 6}), [self.daraj_a.pk])
        self.assertEqual(ids({"day": 0, "neighborhood": self.sabra.pk}), [self.sabra_a.pk])
        self.assertEqual(ids({"search": "الصبره"}), [self.sabra_a.pk])               # neighborhood name
        self.assertEqual(ids({"search": "منطقة B"}), [self.daraj_b.pk])              # zone name
        self.assertEqual(ids({"search": "1421"}), [self.sabra_a.pk])                 # street number
        self.assertEqual(ids({"search": "23"}), [self.daraj_a.pk])                   # building number
        self.assertEqual(ids({"search": "مسجد الدرج"}), [self.daraj_a.pk])           # place name, two words
        self.assertEqual(ids({"search": "مدرسه"}), [self.sabra_a.pk])                # normalized
        self.assertEqual(ids({"search": "غير موجود"}), [])
        self.assertEqual(len(ids({"day": "x"})), 3)  # invalid filter ignored

    def test_inactive_locations_not_searchable(self):
        self.school.is_active = False
        self.school.save()
        self.assertEqual(self.client.get(Z_URL, {"search": "مدرسه"}).data["count"], 0)

    def test_no_n_plus_one(self):
        with CaptureQueriesContext(connection) as small:
            self.client.get(Z_URL)
        for i in range(6):
            zone = make_zone(self.sabra, f"N{i}", [(1, "08:00", "10:00"), (4, "08:00", "10:00")])
            Location.objects.create(place_name=f"م{i}", water_zone=zone, neighborhood=self.sabra)
        with CaptureQueriesContext(connection) as large:
            self.assertEqual(self.client.get(Z_URL).data["count"], 9)
        self.assertEqual(len(small), len(large))

    @mock.patch("apps.water.models.timezone.localdate", return_value=date(2026, 10, 5))  # a Monday
    def test_summary(self, _localdate):
        Location.objects.create(place_name="محذوف", water_zone=self.daraj_a, neighborhood=self.daraj, is_active=False)
        res = self.client.get(f"{Z_URL}summary/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data["today"], res.data["today_display"]), (2, "الاثنين"))
        self.assertEqual([d["label"] for d in res.data["days"]],
                         ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"])
        self.assertEqual([d["count"] for d in res.data["days"]], [2, 0, 1, 1, 0, 1, 1])
        self.assertEqual((res.data["zones_count"], res.data["locations_count"]), (3, 3))
        res = self.client.get(f"{Z_URL}summary/", {"neighborhood": self.daraj.pk})
        self.assertEqual([d["count"] for d in res.data["days"]], [1, 0, 1, 0, 0, 1, 1])
        self.assertEqual((res.data["zones_count"], res.data["locations_count"]), (2, 2))

    @mock.patch("apps.water.models.timezone.localdate", return_value=date(2026, 10, 3))  # a Saturday
    def test_summary_saturday_is_zero(self, _localdate):
        self.assertEqual(self.client.get(f"{Z_URL}summary/").data["today"], 0)


class ZoneWriteTests(WaterTestBase):
    def test_create_auto_code_name_and_slots(self):
        self.login()
        res = self.client.post(Z_URL, {"neighborhood": self.daraj.pk, "note": " شمال الشارع ",
                                       "slots": [{"day": 1, "start_time": "22:00", "end_time": "02:00"},
                                                 {"day": 0, "start_time": "08:00", "end_time": "10:00",
                                                  "note": "ضغط"}]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["code"], res.data["name"], res.data["sort_order"], res.data["note"]),
                         ("C", "منطقة C", 3, "شمال الشارع"))
        self.assertEqual(res.data["schedule_text"], "السبت 08:00–10:00 · الأحد 22:00–02:00")  # overnight allowed
        self.assertEqual((res.data["locations"], res.data["locations_count"]), ([], 0))
        zone = WaterZone.objects.get(pk=res.data["id"])
        self.assertEqual(set(zone.slots.values_list("source", flat=True)), {"manual"})
        log = AuditLog.objects.get(entity_type="waterzone", entity_id=str(zone.pk), action="CREATE")
        self.assertEqual(len(log.after_data["slots"]), 2)
        # explicit code without a name -> default name from that code
        res = self.client.post(Z_URL, {"neighborhood": self.daraj.pk, "code": "x"}, format="json")
        self.assertEqual((res.data["code"], res.data["name"]), ("X", "منطقة X"))
        # first zone of an empty neighborhood
        res = self.client.post(Z_URL, {"neighborhood": Neighborhood.objects.get(name="النصر").pk, "name": "الحارة"},
                               format="json")
        self.assertEqual((res.data["code"], res.data["name"], res.data["display_name"]), ("A", "الحارة", "النصر — الحارة"))

    def test_validation(self):
        self.login()
        res = self.client.post(Z_URL, {"name": "منطقة A", "neighborhood": self.daraj.pk}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data, {"name": ["يوجد منطقة بهذا الاسم في نفس الحي."]})
        # compared with name_key: taa marbuta / case variants are the same name
        self.assertEqual(self.client.post(Z_URL, {"name": "منطقه a", "neighborhood": self.daraj.pk},
                                          format="json").status_code, 400)
        res = self.client.post(Z_URL, {"name": "x"}, format="json")
        self.assertEqual(res.data["neighborhood"], ["الحي مطلوب."])
        res = self.client.post(Z_URL, {"neighborhood": 999999}, format="json")
        self.assertEqual(res.data["neighborhood"], ["الحي المحدد غير موجود."])
        res = self.client.post(Z_URL, {"neighborhood": self.sabra.pk, "slots": [
            {"day": 7, "start_time": "25:00", "end_time": "x"},
            {"day": 1, "start_time": "08:00", "end_time": "08:00"}]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(set(res.data["slots"][0]), {"day", "start_time", "end_time"})
        self.assertEqual(str(res.data["slots"][1]["end_time"][0]), "وقت النهاية يجب أن يختلف عن وقت البداية.")
        res = self.client.post(Z_URL, {"neighborhood": self.sabra.pk, "slots": [
            {"day": 1, "start_time": "08:00", "end_time": "09:00"},
            {"day": 1, "start_time": "08:00", "end_time": "09:00", "note": "مكرر"}]}, format="json")
        self.assertEqual(res.data["slots"], ["لا يمكن تكرار نفس الموعد (اليوم والوقت) أكثر من مرة."])
        res = self.client.post(Z_URL, {"neighborhood": self.sabra.pk, "note": "x" * 301}, format="json")
        self.assertIn("note", res.data)
        res = self.client.post(Z_URL, {"neighborhood": self.sabra.pk, "sort_order": 2 ** 31}, format="json")
        self.assertIn("sort_order", res.data)  # beyond the database integer range: 400, not a server error
        self.assertEqual(WaterZone.objects.filter(neighborhood=self.sabra).count(), 1)  # nothing written on error

    def test_same_name_allowed_in_other_neighborhood(self):
        self.login()
        res = self.client.post(Z_URL, {"name": "منطقة B", "neighborhood": self.sabra.pk}, format="json")
        self.assertEqual(res.status_code, 201)

    def test_update_replaces_slots_only_when_present(self):
        self.login()
        url = f"{Z_URL}{self.daraj_a.pk}/"
        res = self.client.patch(url, {"note": "تعديل"}, format="json")
        self.assertEqual((res.status_code, res.data["note"], res.data["days"]), (200, "تعديل", [2, 6]))
        res = self.client.patch(url, {"slots": [{"day": 4, "start_time": "10:00", "end_time": "11:00"}]},
                                format="json")
        self.assertEqual((res.data["days"], res.data["schedule_text"]), ([4], "الأربعاء 10:00–11:00"))
        self.assertEqual(self.daraj_a.slots.count(), 1)
        res = self.client.put(url, {"name": "منطقة A", "neighborhood": self.daraj.pk, "slots": []}, format="json")
        self.assertEqual((res.status_code, res.data["slots"]), (200, []))
        res = self.client.patch(url, {"name": "منطقة B"}, format="json")
        self.assertEqual(res.status_code, 400)
        log = AuditLog.objects.filter(entity_type="waterzone", entity_id=str(self.daraj_a.pk),
                                      action="UPDATE").order_by("id")[1]
        self.assertEqual((len(log.before_data["slots"]), len(log.after_data["slots"])), (2, 1))
        # the buildings now read the new (empty) schedule
        res = self.client.get(f"{LOC_URL}{self.market.pk}/")
        self.assertEqual((res.data["water_schedule"], res.data["water_schedule_text"]), ([], ""))

    def test_moving_zone_to_other_neighborhood_moves_its_buildings(self):
        self.login()
        res = self.client.patch(f"{Z_URL}{self.daraj_b.pk}/", {"neighborhood": self.sabra.pk}, format="json")
        self.assertEqual(res.status_code, 200)
        res = self.client.patch(f"{Z_URL}{self.daraj_a.pk}/", {"neighborhood": self.sabra.pk}, format="json")
        self.assertEqual(res.data, {"name": ["يوجد منطقة بهذا الاسم في نفس الحي."]})
        res = self.client.patch(f"{Z_URL}{self.daraj_a.pk}/", {"neighborhood": self.sabra.pk, "name": "منطقة Z"},
                                format="json")
        self.assertEqual(res.data["display_name"], "الصبرة — منطقة Z")
        self.market.refresh_from_db()
        self.assertEqual(self.market.neighborhood, self.sabra)
        log = AuditLog.objects.filter(entity_type="location", entity_id=str(self.market.pk)).latest("id")
        self.assertEqual((log.before_data["neighborhood"], log.after_data["neighborhood"]), (self.daraj.pk, self.sabra.pk))

    def test_delete_unassigns_buildings(self):
        self.login()
        slot_ids = list(self.daraj_a.slots.values_list("pk", flat=True))
        self.assertEqual(self.client.delete(f"{Z_URL}{self.daraj_a.pk}/").status_code, 204)
        self.market.refresh_from_db()
        self.assertIsNone(self.market.water_zone)
        self.assertEqual(self.market.neighborhood, self.daraj)  # neighborhood kept
        self.assertFalse(WaterSlot.objects.filter(pk__in=slot_ids).exists())
        log = AuditLog.objects.get(entity_type="waterzone", entity_id=str(self.daraj_a.pk), action="DELETE")
        self.assertEqual(log.before_data["location_ids"], sorted([self.market.pk, self.mosque.pk]))
        loc_log = AuditLog.objects.filter(entity_type="location", entity_id=str(self.market.pk)).latest("id")
        self.assertEqual((loc_log.before_data["water_zone"], loc_log.after_data["water_zone"]), (self.daraj_a.pk, None))

    def test_assign_and_unassign(self):
        self.login()
        res = self.client.post(f"{Z_URL}{self.sabra_a.pk}/assign/",
                               {"location_ids": [self.council.pk, self.market.pk]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual({l["id"] for l in res.data["locations"]}, {self.school.pk, self.council.pk, self.market.pk})
        self.assertEqual(res.data["locations_count"], 3)
        for loc in (self.council, self.market):
            loc.refresh_from_db()
            self.assertEqual((loc.water_zone, loc.neighborhood), (self.sabra_a, self.sabra))  # neighborhood synced
        self.assertEqual(self.client.get(f"{Z_URL}{self.daraj_a.pk}/").data["locations_count"], 1)
        zone_log = AuditLog.objects.filter(entity_type="waterzone", entity_id=str(self.sabra_a.pk)).latest("id")
        self.assertEqual(zone_log.after_data["location_ids"], sorted([self.school.pk, self.council.pk, self.market.pk]))
        self.assertTrue(AuditLog.objects.filter(entity_type="location", entity_id=str(self.council.pk),
                                                action="UPDATE").exists())

        # unassign ignores locations that are not in this zone
        res = self.client.post(f"{Z_URL}{self.sabra_a.pk}/unassign/",
                               {"location_ids": [self.council.pk, self.mosque.pk]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.council.refresh_from_db()
        self.mosque.refresh_from_db()
        self.assertIsNone(self.council.water_zone)
        self.assertEqual(self.council.neighborhood, self.sabra)
        self.assertEqual(self.mosque.water_zone, self.daraj_a)

    def test_assign_validation(self):
        self.login()
        url = f"{Z_URL}{self.sabra_a.pk}/assign/"
        self.assertEqual(self.client.post(url, {}, format="json").data["location_ids"], ["يجب تحديد المواقع."])
        self.assertEqual(self.client.post(url, {"location_ids": []}, format="json").status_code, 400)
        res = self.client.post(url, {"location_ids": [self.council.pk, 999999]}, format="json")
        self.assertEqual(res.data, {"location_ids": ["بعض المواقع المحددة غير موجودة."]})
        self.council.refresh_from_db()
        self.assertIsNone(self.council.water_zone)

    def test_viewer_forbidden(self):
        self.login(self.viewer)
        url = f"{Z_URL}{self.daraj_a.pk}/"
        self.assertEqual(self.client.post(Z_URL, {"neighborhood": self.daraj.pk}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(url, {"note": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.assertEqual(self.client.post(f"{url}assign/", {"location_ids": [self.council.pk]},
                                          format="json").status_code, 403)
        self.assertEqual(self.client.post(f"{url}unassign/", {"location_ids": [self.market.pk]},
                                          format="json").status_code, 403)
        self.assertTrue(WaterZone.objects.filter(pk=self.daraj_a.pk).exists())

    @override_settings(PUBLIC_SEARCH_ENABLED=False)
    def test_anonymous_blocked_when_public_search_disabled(self):
        self.assertEqual(self.client.get(Z_URL).status_code, 403)
        self.assertEqual(self.client.get(f"{Z_URL}summary/").status_code, 403)
        self.assertEqual(self.client.get(N_URL).status_code, 403)

    @override_settings(PUBLIC_SEARCH_ENABLED=True)
    def test_anonymous_read_only_when_public_search_enabled(self):
        self.assertEqual(self.client.get(Z_URL).status_code, 200)
        self.assertEqual(self.client.get(f"{Z_URL}{self.daraj_a.pk}/").status_code, 200)
        self.assertEqual(self.client.post(Z_URL, {"neighborhood": self.daraj.pk}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"{Z_URL}{self.daraj_a.pk}/").status_code, 403)


class LocationZoneTests(WaterTestBase):
    def test_payload(self):
        self.login(self.viewer)
        res = self.client.get(f"{LOC_URL}{self.market.pk}/")
        self.assertEqual((res.data["neighborhood"], res.data["neighborhood_name"]), (self.daraj.pk, "الدرج"))
        self.assertEqual((res.data["water_zone"], res.data["water_zone_name"]), (self.daraj_a.pk, "الدرج — منطقة A"))
        self.assertEqual([(s["day"], s["day_display"], s["start_time"], s["end_time"])
                          for s in res.data["water_schedule"]],
                         [(2, "الاثنين", "09:00", "12:00"), (6, "الجمعة", "09:00", "12:00")])
        self.assertEqual(res.data["water_schedule_text"], "الاثنين، الجمعة 09:00–12:00")
        res = self.client.get(f"{LOC_URL}{self.council.pk}/")
        self.assertEqual((res.data["water_zone"], res.data["water_zone_name"], res.data["water_schedule"],
                          res.data["water_schedule_text"]), (None, None, [], ""))

    def test_write_zone_syncs_neighborhood(self):
        self.login()
        res = self.client.patch(f"{LOC_URL}{self.council.pk}/", {"water_zone": self.daraj_b.pk}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["neighborhood"], res.data["water_zone_name"]), (self.daraj.pk, "الدرج — منطقة B"))
        log = AuditLog.objects.filter(entity_id=str(self.council.pk), action="UPDATE").latest("id")
        self.assertEqual((log.before_data["water_zone"], log.after_data["water_zone"]), (None, self.daraj_b.pk))
        self.assertEqual(log.after_data["water_zone_name"], "الدرج — منطقة B")
        # zone wins over a conflicting neighborhood in the same payload
        res = self.client.patch(f"{LOC_URL}{self.council.pk}/",
                                {"water_zone": self.sabra_a.pk, "neighborhood": self.daraj.pk}, format="json")
        self.assertEqual(res.data["neighborhood"], self.sabra.pk)
        # moving the building to another neighborhood drops the zone of the old one
        res = self.client.patch(f"{LOC_URL}{self.council.pk}/", {"neighborhood": self.daraj.pk}, format="json")
        self.assertEqual((res.data["neighborhood"], res.data["water_zone"]), (self.daraj.pk, None))
        # same neighborhood keeps the zone
        res = self.client.patch(f"{LOC_URL}{self.market.pk}/", {"neighborhood": self.daraj.pk}, format="json")
        self.assertEqual(res.data["water_zone"], self.daraj_a.pk)
        res = self.client.patch(f"{LOC_URL}{self.market.pk}/", {"water_zone": None}, format="json")
        self.assertEqual((res.data["water_zone"], res.data["neighborhood"]), (None, self.daraj.pk))
        res = self.client.post(LOC_URL, {"place_name": "جديد", "water_zone": 999999}, format="json")
        self.assertEqual(res.data["water_zone"], ["منطقة المياه المحددة غير موجودة."])

    def test_filters(self):
        make_zone(self.sabra, "B", [])
        Location.objects.create(place_name="منطقة فارغة", neighborhood=self.sabra,
                                water_zone=WaterZone.objects.get(neighborhood=self.sabra, code="B"))
        self.login(self.viewer)
        names = lambda params: sorted(r["place_name"] for r in self.client.get(LOC_URL, params).data["results"])  # noqa
        self.assertEqual(names({"neighborhood": self.daraj.pk}), ["سوق الدرج", "مسجد الدرج"])
        self.assertEqual(names({"water_zone": self.sabra_a.pk}), ["مدرسة بنات الصبرة"])
        self.assertEqual(names({"has_schedule": "1"}), ["سوق الدرج", "مدرسة بنات الصبرة", "مسجد الدرج"])
        self.assertEqual(names({"has_schedule": "1", "search": "مسجد"}), ["مسجد الدرج"])
        self.assertEqual(self.client.get(LOC_URL).data["count"], 5)

    def test_v1_endpoints_removed(self):
        self.login()
        self.assertEqual(self.client.put(f"{LOC_URL}{self.market.pk}/water-schedule/", {"slots": []},
                                         format="json").status_code, 404)
        self.assertEqual(self.client.get("/api/water-schedules/").status_code, 404)
        self.assertEqual(self.client.get("/api/water-schedules/summary/").status_code, 404)

    def test_location_list_has_no_n_plus_one(self):
        self.login(self.viewer)
        with CaptureQueriesContext(connection) as small:
            self.client.get(LOC_URL)
        for i in range(5):
            zone = make_zone(self.sabra, f"L{i}", [(1, "08:00", "10:00")])
            Location.objects.create(place_name=f"موقع {i}", neighborhood=self.sabra, water_zone=zone)
        with CaptureQueriesContext(connection) as large:
            self.assertEqual(self.client.get(LOC_URL).data["count"], 9)
        self.assertEqual(len(small), len(large))


# ---------------------------------------------------------------------------------------
# gaza-city.org parser and fetch command (no network: fixtures + fake client)
# ---------------------------------------------------------------------------------------
SAMPLE_PAGE = """
<div class="tab-pane fade show active" id="nav_1" role="tabpanel">
  <div class="row"><div class="col"><p>رقم المبنى:</p></div><div class="col"><p>16</p></div></div>
  <div class="row"><div class="col"><p>الحي:</p></div>
    <div class="col"><p>
        الصبرة
    </p></div></div>
  <div class="row"><div class="col"><p>لجنة الحي:</p></div><div class="col"><p>الصبرة الشرقية</p></div></div>
</div>
<div class="tab-pane fade" id="nav_2" role="tabpanel" aria-labelledby="nav_2_tab" tabindex="0">
  <table class="table table-hover table-bordered mt-3 ">
    <thead id="craftTableHead"><th class="text-right">اليوم</th><th>الوقت</th><th>ملاحظة</th></thead>
    <tbody id="building_crafts_mod">
      <tr>
        <td class="p-2"><p class="m-0"> سبت   </p></td>
        <td class="p-2"><p class="m-0">02:00 - 06:00</p>
        <td class="p-2"><p class="m-0">    </p></td>
        </td>
      </tr>
      <tr>
        <td class="p-2"><p class="m-0"> ثلاثاء   </p></td>
        <td class="p-2"><p class="m-0">02:00 - 06:00</p>
        <td class="p-2"><p class="m-0"> ضغط &amp; منخفض </p></td>
        </td>
      </tr>
    </tbody>
  </table>
</div>
"""

NO_SCHEDULE_PAGE = """
<div id="nav_1"><p>لجنة الحي:</p><p>الشيخ عجلين الغربي</p><p>الحي:</p><p>الشيخ عجلين</p></div>
<div class="tab-pane fade" id="nav_2"><div class="alert alert-danger  mt-2"> لا يوجد جدول مياه في هذا المبنى</div></div>
"""


class ParserTests(APITestCase):
    def test_schedule_rows_from_malformed_html(self):
        info = parse_building_info(SAMPLE_PAGE)
        self.assertEqual(info.neighborhood, "الصبرة")  # not "الصبرة الشرقية" (لجنة الحي)
        self.assertFalse(info.no_schedule)
        self.assertEqual([(s.day, s.start_time, s.end_time, s.note) for s in info.slots],
                         [(0, time(2), time(6), ""), (3, time(2), time(6), "ضغط & منخفض")])

    def test_no_schedule_and_label_order(self):
        info = parse_building_info(NO_SCHEDULE_PAGE)
        self.assertTrue(info.no_schedule)
        self.assertEqual(info.slots, [])
        self.assertEqual(info.neighborhood, "الشيخ عجلين")

    def test_only_committee_label_gives_no_neighborhood(self):
        self.assertIsNone(parse_building_info("<p>لجنة الحي:</p><p>الدرج</p>").neighborhood)
        self.assertIsNone(parse_building_info("<p>الحي:</p><p>لجنة الحي:</p><p>الدرج</p>").neighborhood)

    def test_day_variants(self):
        expected = {
            0: ["سبت", "السبت"], 1: ["احد", "أحد", "الأحد", "الاحد"], 2: ["اثنين", "الاثنين", "الإثنين"],
            3: ["ثلاثاء", "الثلاثاء"], 4: ["اربعاء", "أربعاء", "الأربعاء", "الاربعاء"], 5: ["خميس", "الخميس"],
            6: ["جمعة", "الجمعة", "جمعه"],
        }
        for day, words in expected.items():
            for word in words:
                self.assertEqual(parse_day(f"  {word} "), day, word)
        self.assertIsNone(parse_day("يوم ما"))

    def test_unreadable_rows_and_overnight(self):
        page = """<tbody id="building_crafts_mod">
            <tr><td>خميس<td>٢٢:٠٠ - ٠٢:٠٠<td></tr>
            <tr><td>غداً<td>02:00 - 06:00<td></tr>
            <tr><td>جمعة<td>05:00 - 05:00<td></tr>
        </tbody>"""
        info = parse_building_info(page)
        self.assertEqual([(s.day, s.start_time, s.end_time) for s in info.slots], [(5, time(22), time(2))])
        self.assertEqual(len(info.skipped_rows), 2)
        self.assertFalse(info.no_schedule)

    def test_csrf_token(self):
        page = '<head><meta charset="utf-8"><meta name="csrf-token" content="abc123XYZ"></head>'
        self.assertEqual(parse_csrf_token(page), "abc123XYZ")
        self.assertIsNone(parse_csrf_token("<head></head>"))


class FakeClient:
    """Stands in for GazaCityClient: the tests never touch the network."""

    pages = {}

    def building_info(self, building_number, street_number):
        page = self.pages[(building_number, street_number)]
        if isinstance(page, Exception):
            raise page
        return page


def schedule_page(neighborhood, rows):
    body = "".join(f"<tr><td><p> {day} </p></td><td><p>{window}</p><td><p></p></td></td></tr>" for day, window in rows)
    return (f'<div id="nav_1"><p>الحي:</p><p>{neighborhood}</p><p>لجنة الحي:</p><p>x</p></div>'
            f'<div id="nav_2"><table><tbody id="building_crafts_mod">{body}</tbody></table></div>')


class FetchCommandTests(APITestCase):
    def setUp(self):
        self.sabra = Neighborhood.objects.get(name="الصبرة")
        self.existing = make_zone(self.sabra, "A", [(0, "02:00", "06:00"), (3, "02:00", "06:00")], sort_order=1)
        self.school = Location.objects.create(place_name="مدرسة", building_number="16", street_number="1421")
        self.twin = Location.objects.create(place_name="مدرسة 2", building_number="17", street_number="1421")
        self.other = Location.objects.create(place_name="بيت", building_number="18", street_number="1421")
        self.dup = Location.objects.create(place_name="بيت 2", building_number="19", street_number="1421")
        self.council = Location.objects.create(place_name="مجلس الوزراء", building_number="95", street_number="1050",
                                               water_zone=self.existing, neighborhood=self.sabra)
        self.broken = Location.objects.create(place_name="خطأ", building_number="1", street_number="2")
        Location.objects.create(place_name="بلا أرقام")  # skipped: no building/street number
        other_rows = [("اثنين", "09:00 - 12:00"), ("جمعة", "09:00 - 12:00")]
        FakeClient.pages = {
            ("16", "1421"): SAMPLE_PAGE,                                  # = existing zone A (Sat+Tue 02-06)
            ("17", "1421"): schedule_page("الصبرة", [("ثلاثاء", "02:00 - 06:00"), ("السبت", "02:00 - 06:00")]),
            ("18", "1421"): schedule_page("الصبره", other_rows),           # new signature -> new zone B
            ("19", "1421"): schedule_page("الصبرة", other_rows + [("الإثنين", "09:00 - 12:00")]),  # dup row -> B
            ("95", "1050"): NO_SCHEDULE_PAGE,                             # zone left unchanged
            ("1", "2"): OSError("connection reset"),
        }

    def run_command(self, *args):
        out, err = StringIO(), StringIO()
        with mock.patch.object(fetch, "GazaCityClient", FakeClient), mock.patch.object(fetch.time, "sleep") as sleep:
            call_command("fetch_water_schedules", *args, stdout=out, stderr=err)
        return out.getvalue(), err.getvalue(), sleep

    def test_assigns_by_signature_and_creates_next_zone(self):
        out, err, sleep = self.run_command("--delay", "0.1")
        self.assertTrue(all(c.args[0] == 1.0 for c in sleep.call_args_list))  # min 1s between requests
        for loc in (self.school, self.twin, self.other, self.dup, self.council):
            loc.refresh_from_db()
        self.assertEqual((self.school.water_zone, self.twin.water_zone), (self.existing, self.existing))
        self.assertEqual(self.school.neighborhood, self.sabra)
        new_zone = self.other.water_zone
        self.assertEqual((new_zone.code, new_zone.name, new_zone.neighborhood), ("B", "منطقة B", self.sabra))
        self.assertEqual(self.dup.water_zone, new_zone)
        self.assertEqual(list(new_zone.slots.values_list("day", "start_time", "source")),
                         [(2, time(9), "gaza-city.org"), (6, time(9), "gaza-city.org")])
        self.assertEqual(self.existing.slots.count(), 2)  # matching never rewrites a zone's slots
        self.assertEqual(self.council.water_zone, self.existing)  # "no schedule" leaves the zone
        self.assertEqual(self.council.neighborhood.name, "الشيخ عجلين")
        self.assertIn("FAILED", err)
        log = AuditLog.objects.get(action="IMPORT", username="fetch_water_schedules")
        stats = log.after_data
        self.assertEqual((stats["processed"], stats["failed"], stats["zones_matched"], stats["zones_created"],
                          stats["locations_assigned"], stats["no_schedule"]), (5, 1, 3, 1, 4, 1))
        self.assertIn("Summary", out)

        # second run: everybody already sits in the right zone, nothing new is created
        AuditLog.objects.all().delete()
        self.run_command()
        stats = AuditLog.objects.get(action="IMPORT").after_data
        self.assertEqual((stats["zones_created"], stats["already_in_zone"]), (0, 4))
        self.assertEqual(WaterZone.objects.filter(neighborhood=self.sabra).count(), 2)

    def test_dry_run_and_only_missing(self):
        out, _, _ = self.run_command("--dry-run")
        self.assertIn("new zone «منطقة B»", out)
        self.assertEqual(WaterZone.objects.count(), 1)
        self.school.refresh_from_db()
        self.assertIsNone(self.school.water_zone)
        self.assertFalse(AuditLog.objects.filter(action="IMPORT").exists())

        out, _, _ = self.run_command("--only-missing", "--limit", "2")
        self.assertIn("for 2 location(s)", out)
        self.assertNotIn("مجلس الوزراء", out)

    def test_no_neighborhood_goes_to_unknown(self):
        page = SAMPLE_PAGE.replace("<p>الحي:</p>", "<p>رقم:</p>")
        FakeClient.pages = {k: page for k in FakeClient.pages}
        self.run_command("--limit", "1")
        self.school.refresh_from_db()
        self.assertEqual(self.school.neighborhood.name, "غير محدد")
        self.assertEqual(self.school.water_zone.display_name, "غير محدد — منطقة A")
