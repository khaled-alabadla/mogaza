from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import DistributionGroup, WaterShape

URL = "/api/water-shapes/"
SQUARE = [[31.5100, 34.4500], [31.5100, 34.4520], [31.5120, 34.4520], [31.5120, 34.4500]]


class WaterShapeTests(APITestCase):
    """The water areas drawn on «الخريطة», each tied to a row of the distribution table."""

    def setUp(self):
        self.editor = User.objects.create_user("e", password="S3cure-Pass-2026", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("v", password="S3cure-Pass-2026", role=User.Role.VIEWER)
        self.row = DistributionGroup.objects.order_by("sort_order").first()  # السبت / الثلاثاء (seeded)

    def test_editor_draws_edits_and_deletes_with_audit(self):
        self.client.force_authenticate(self.editor)
        res = self.client.post(URL, {"group": self.row.pk, "name": "  النديم ", "rings": [SQUARE + [SQUARE[0]]]},
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
        res = self.client.post(URL, {"water_days": [5, 1], "name": "حي مرسوم", "rings": [SQUARE]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["days_text"], "الأحد / الخميس")  # the existing row
        row = DistributionGroup.objects.get(pk=res.data["group"])
        self.assertIn("حي مرسوم", [a.name for a in row.areas.all()])
        self.assertEqual(DistributionGroup.objects.count(), rows)
        res = self.client.post(URL, {"water_days": [6], "name": "منطقة الجمعة", "rings": [SQUARE]}, format="json")
        self.assertEqual(res.data["days_text"], "الجمعة")  # a new row
        self.assertEqual(DistributionGroup.objects.count(), rows + 1)
        self.assertEqual(self.client.post(URL, {"name": "x", "rings": [SQUARE]}, format="json").status_code, 400)

    def test_editing_the_table_row_keeps_its_drawings(self):
        shape = WaterShape.objects.create(group=self.row, name="النديم", rings=[SQUARE])
        self.client.force_authenticate(self.editor)
        res = self.client.patch(f"/api/water-table/{self.row.pk}/", {"areas": ["النديم", "حي جديد"]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(WaterShape.objects.filter(pk=shape.pk).exists())
