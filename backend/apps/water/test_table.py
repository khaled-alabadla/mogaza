from unittest import mock

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import DistributionGroup

URL = "/api/water-table/"


class WaterTableTests(APITestCase):
    def setUp(self):
        self.editor = User.objects.create_user("e", password="S3cure-Pass-2026", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("v", password="S3cure-Pass-2026", role=User.Role.VIEWER)

    def test_seeded_table_matches_the_paper(self):
        self.client.force_authenticate(self.viewer)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        rows = res.data["results"]
        self.assertEqual([r["days_text"] for r in rows],
                         ["السبت / الثلاثاء", "الاثنين / الجمعة", "الأحد / الخميس", "السبت / الأربعاء",
                          "الأحد / الثلاثاء"])
        first = [a["name"] for a in rows[0]["area_list"]]
        self.assertEqual(first[:4], ["النديم", "عين جالوت", "الزيتون مربع سلمي", "نادي الزيتون"])
        self.assertNotIn("البلدة القديمة", [a["name"] for a in rows[1]["area_list"]])  # struck out on the paper
        self.assertEqual([a["name"] for a in rows[4]["area_list"]], ["شارع اليرموك", "تاج مول 4", "برشلونة", "وزارة العمل"])

    def test_today(self):
        import datetime
        self.client.force_authenticate(self.viewer)
        with mock.patch("apps.water.models.timezone.localdate", return_value=datetime.date(2026, 10, 3)):  # Saturday
            res = self.client.get(URL)
        self.assertEqual((res.data["today"], res.data["today_display"]), (0, "السبت"))

    def test_editor_crud_with_audit(self):
        self.client.force_authenticate(self.editor)
        res = self.client.post(URL, {"days": [6, 2, 2], "areas": [" حي جديد ", "", "حي جديد", "شارع آخر"]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        gid = res.data["id"]
        self.assertEqual(res.data["days"], [2, 6])
        self.assertEqual([a["name"] for a in res.data["area_list"]], ["حي جديد", "شارع آخر"])

        res = self.client.patch(f"{URL}{gid}/", {"areas": ["شارع آخر", "إضافة"], "note": "مؤقت"}, format="json")
        self.assertEqual([a["name"] for a in res.data["area_list"]], ["شارع آخر", "إضافة"])
        res = self.client.patch(f"{URL}{gid}/", {"days": [1]}, format="json")
        self.assertEqual(res.data["days_text"], "الأحد")
        self.assertEqual(len(res.data["area_list"]), 2)  # areas untouched when not sent

        self.assertEqual(self.client.delete(f"{URL}{gid}/").status_code, 204)
        self.assertFalse(DistributionGroup.objects.filter(pk=gid).exists())
        actions = list(AuditLog.objects.filter(entity_type="watertable", entity_id=str(gid))
                       .order_by("id").values_list("action", flat=True))
        self.assertEqual(actions, ["CREATE", "UPDATE", "UPDATE", "DELETE"])

    def test_validation(self):
        self.client.force_authenticate(self.editor)
        self.assertIn("days", self.client.post(URL, {"days": [], "areas": ["x"]}, format="json").data)
        self.assertIn("days", self.client.post(URL, {"days": [7], "areas": ["x"]}, format="json").data)
        self.assertIn("areas", self.client.post(URL, {"days": [1], "areas": ["  "]}, format="json").data)
        self.assertIn("areas", self.client.post(URL, {"days": [1]}, format="json").data)

    def test_permissions(self):
        gid = DistributionGroup.objects.first().pk
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.post(URL, {"days": [1], "areas": ["x"]}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(f"{URL}{gid}/", {"note": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"{URL}{gid}/").status_code, 403)
        self.client.force_authenticate(None)
        with override_settings(PUBLIC_SEARCH_ENABLED=False):
            self.assertEqual(self.client.get(URL).status_code, 403)
        with override_settings(PUBLIC_SEARCH_ENABLED=True):
            self.assertEqual(self.client.get(URL).status_code, 200)
