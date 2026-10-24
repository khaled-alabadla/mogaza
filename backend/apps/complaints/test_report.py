from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import DailyReport

URL = "/api/daily-report/"
REPORT = {
    "report_date": "2026-10-20",
    "rows": [
        {"source": "اتصال هاتفي", "complaints": 201, "inquiries": 71},
        {"source": "  واتساب  ", "complaints": 2, "inquiries": 19},
    ],
    "summons": 3,
    "archived": 145,
}


class DailyReportTests(APITestCase):
    def setUp(self):
        self.editor = User.objects.create_user("ed", password="pass1234", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("vw", password="pass1234", role=User.Role.VIEWER)
        self.client.force_authenticate(self.editor)

    def test_empty_before_the_first_report(self):
        self.assertEqual(self.client.get(URL).data, {"report": None})

    def test_only_the_latest_report_is_kept(self):
        res = self.client.put(URL, REPORT, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["report"]["rows"][1], {"source": "واتساب", "complaints": 2, "inquiries": 19})
        self.assertEqual(res.data["report"]["updated_by_name"], "ed")
        self.client.put(URL, {**REPORT, "report_date": "2026-10-21", "archived": 99}, format="json")
        self.assertEqual(DailyReport.objects.count(), 1)
        report = self.client.get(URL).data["report"]
        self.assertEqual((str(report["report_date"]), report["archived"]), ("2026-10-21", 99))
        self.assertEqual(AuditLog.objects.filter(entity_type="dailyreport").count(), 2)

    def test_validation(self):
        for bad in ({**REPORT, "rows": []}, {**REPORT, "report_date": ""},
                    {**REPORT, "rows": [{"source": "", "complaints": 1}]},
                    {**REPORT, "rows": [{"source": "x", "complaints": -1}]}):
            self.assertEqual(self.client.put(URL, bad, format="json").status_code, 400)

    def test_permissions(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.viewer.permissions = ["report.view"]
        self.viewer.save()
        self.assertEqual(self.client.get(URL).status_code, 200)
        self.assertEqual(self.client.put(URL, REPORT, format="json").status_code, 403)
