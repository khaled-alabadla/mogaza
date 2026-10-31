from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import DistributionGroup, WaterShape, WaterSupply

URL = "/api/water-shapes/"
SQUARE = [[31.5100, 34.4500], [31.5100, 34.4520], [31.5120, 34.4520], [31.5120, 34.4500]]


class WaterShapeTests(APITestCase):
    """The water areas drawn on «الخريطة», each tied to a row of the distribution table."""

    def setUp(self):
        self.editor = User.objects.create_user("e", password="S3cure-Pass-2026", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("v", password="S3cure-Pass-2026", role=User.Role.VIEWER)
        self.row = DistributionGroup.objects.order_by("sort_order").first()  # السبت / الثلاثاء (seeded)
        self.mekorot = WaterSupply.objects.get(kind="mekorot").pk

    def test_editor_draws_edits_and_deletes_with_audit(self):
        self.client.force_authenticate(self.editor)
        res = self.client.post(URL, {"group": self.row.pk, "name": "  النديم ", "rings": [SQUARE + [SQUARE[0]]],
                                     "supply": self.mekorot},
                               format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["name"], "النديم")
        self.assertEqual(res.data["days"], [0, 3])
        self.assertEqual(res.data["days_text"], "السبت / الثلاثاء")
        self.assertEqual(len(res.data["rings"][0]), 4)  # the repeated first point is dropped
        pk = res.data["id"]
        other = DistributionGroup.objects.order_by("sort_order")[1]
        res = self.client.patch(f"{URL}{pk}/", {"group": other.pk}, format="json")
        self.assertEqual(res.data["days_text"], other.days_text)
        self.assertEqual(self.client.delete(f"{URL}{pk}/").status_code, 204)
        actions = list(AuditLog.objects.filter(entity_type="watershape").values_list("action", flat=True))
        self.assertEqual(sorted(actions), ["CREATE", "DELETE", "UPDATE"])

    def test_listed_with_today_for_viewers_who_cannot_draw(self):
        WaterShape.objects.create(group=self.row, name="عين جالوت", rings=[SQUARE])
        self.client.force_authenticate(self.viewer)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn("today", res.data)
        self.assertEqual([s["name"] for s in res.data["results"]], ["عين جالوت"])
        self.assertEqual(self.client.post(URL, {"group": self.row.pk, "name": "x", "rings": [SQUARE]}, format="json")
                         .status_code, 403)

    def test_validation(self):
        self.client.force_authenticate(self.editor)
        bad = [
            {"name": "x", "rings": [SQUARE]},                                         # no row
            {"group": self.row.pk, "name": " ", "rings": [SQUARE]},                   # no name
            {"group": self.row.pk, "name": "x", "rings": [SQUARE[:2]]},               # two points
            {"group": self.row.pk, "name": "x", "rings": [[[32.0, 34.4]] + SQUARE]},  # outside Gaza City
            {"group": self.row.pk, "name": "x", "rings": "مربع"},
            {"group": self.row.pk, "name": "x", "rings": [[["a", "b"]] + SQUARE]},
        ]
        for body in bad:
            self.assertEqual(self.client.post(URL, body, format="json").status_code, 400, body)
        self.assertFalse(WaterShape.objects.exists())

    def test_days_find_or_make_the_row_and_list_the_area(self):
        self.client.force_authenticate(self.editor)
        rows = DistributionGroup.objects.count()
        res = self.client.post(URL, {"water_days": [5, 1], "name": "حي مرسوم", "rings": [SQUARE], "supply": self.mekorot}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["days_text"], "الأحد / الخميس")  # the existing row
        row = DistributionGroup.objects.get(pk=res.data["group"])
        self.assertIn("حي مرسوم", [a.name for a in row.areas.all()])
        self.assertEqual(DistributionGroup.objects.count(), rows)
        res = self.client.post(URL, {"water_days": [6], "name": "منطقة الجمعة", "rings": [SQUARE], "supply": self.mekorot}, format="json")
        self.assertEqual(res.data["days_text"], "الجمعة")  # a new row
        self.assertEqual(DistributionGroup.objects.count(), rows + 1)
        self.assertEqual(self.client.post(URL, {"name": "x", "rings": [SQUARE]}, format="json").status_code, 400)

    def test_editing_the_table_row_keeps_its_drawings(self):
        shape = WaterShape.objects.create(group=self.row, name="النديم", rings=[SQUARE])
        self.client.force_authenticate(self.editor)
        res = self.client.patch(f"/api/water-table/{self.row.pk}/", {"areas": ["النديم", "حي جديد"]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(WaterShape.objects.filter(pk=shape.pk).exists())

    def test_times_per_day(self):
        self.client.force_authenticate(self.editor)
        body = {"water_days": [1, 5], "name": "حي بأوقات", "rings": [SQUARE], "supply": self.mekorot,
                "times": {"1": ["08:00", "12:00"], "5": ["12:00", "16:00"], "3": ["09:00", "10:00"]}}
        res = self.client.post(URL, body, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["times"], {"1": ["08:00", "12:00"], "5": ["12:00", "16:00"]})  # not its day: dropped
        # a day without a time; then the days change: the times of the days gone go too
        res = self.client.patch(f"{URL}{res.data['id']}/", {"water_days": [1], "times": {"1": ["", ""], "5": ["12:00", "16:00"]}},
                                format="json")
        self.assertEqual(res.data["times"], {})
        res = self.client.patch(f"{URL}{res.data['id']}/", {"times": {"1": ["07:30", "11:00"]}}, format="json")
        self.assertEqual(res.data["times"], {"1": ["07:30", "11:00"]})
        shape = WaterShape.objects.get(name="حي بأوقات")
        for times in ({"1": ["8", "12"]}, {"1": ["08:00", "08:00"]}, {"1": ["08:00"]}, {"9": ["08:00", "09:00"]}, ["x"]):
            self.assertEqual(self.client.patch(f"{URL}{shape.pk}/", {"times": times}, format="json").status_code, 400, times)
        shape.refresh_from_db()
        self.assertEqual(shape.times, {"1": ["07:30", "11:00"]})

    def test_water_source_wells_and_faults(self):
        mekorot = WaterSupply.objects.get(kind="mekorot")
        self.client.force_authenticate(self.editor)
        body = {"water_days": [1, 5], "name": "حي البئر", "rings": [SQUARE]}
        res = self.client.post(URL, body, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("supply", res.data)
        # a new well, then an area fed by it
        res = self.client.post("/api/water-supplies/", {"name": " بئر الصفا "}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["kind"], res.data["name"], res.data["broken"]), ("well", "بئر الصفا", False))
        well = res.data["id"]
        self.assertEqual(self.client.post("/api/water-supplies/", {"name": "بئر الصفا"}, format="json").status_code, 400)
        res = self.client.post(URL, {**body, "supply": well}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["supply_info"]["name"], "بئر الصفا")
        row = DistributionGroup.objects.get(pk=res.data["group"])
        self.assertEqual(row.areas.get(name="حي البئر").source, "wells")  # in the table under «الآبار المحلية»
        # «يوجد عطل» is set on the well: every area it feeds shows it
        other = WaterShape.objects.create(group=row, name="جار", rings=[SQUARE], supply_id=well)
        res = self.client.patch(f"{URL}{res.data['id']}/", {"supply_broken": True}, format="json")
        self.assertTrue(res.data["supply_info"]["broken"])
        listed = {s["id"]: s for s in self.client.get(URL).data["results"]}
        self.assertTrue(listed[other.pk]["supply_info"]["broken"])
        # switch to خط ماكروت (fine), clearing the source is not
        res = self.client.patch(f"{URL}{other.pk}/", {"supply": mekorot.pk, "supply_broken": False}, format="json")
        self.assertEqual(res.data["supply_info"]["kind"], "mekorot")
        self.assertEqual(self.client.patch(f"{URL}{other.pk}/", {"supply": None}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/water-supplies/{well}/", {"broken": False}, format="json").status_code, 200)
        self.assertTrue(AuditLog.objects.filter(entity_type="watersupply").exists())
        # viewers read, can't write
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get("/api/water-supplies/").status_code, 200)
        self.assertEqual(self.client.post("/api/water-supplies/", {"name": "x"}, format="json").status_code, 403)
