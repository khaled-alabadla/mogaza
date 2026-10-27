from datetime import timedelta
from unittest import mock

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.complaints.models import Complaint, DailyReport, UrgentComplaint
from apps.locations.models import Circular
from apps.water.models import DistributionArea, DistributionGroup

URL = "/api/home/"


class HomeTests(APITestCase):
    """«الرئيسية»: today's figures in one request, each part only for those who may see it."""

    def setUp(self):
        self.editor = User.objects.create_user("e", password="S3cure-Pass-2026", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("v", password="S3cure-Pass-2026", role=User.Role.VIEWER)
        today = timezone.localdate()
        UrgentComplaint.objects.create(name="أ", submitted_on=today - timedelta(days=5))
        UrgentComplaint.objects.create(name="ب", submitted_on=today - timedelta(days=2))
        UrgentComplaint.objects.create(name="محلولة", submitted_on=today - timedelta(days=9),
                                       status=UrgentComplaint.Status.RESOLVED)
        UrgentComplaint.objects.create(name="محذوفة", submitted_on=today - timedelta(days=20), is_active=False)
        Complaint.objects.create(kind=Complaint.Kind.COMPLAINT, name="1")
        Complaint.objects.create(kind=Complaint.Kind.COMPLAINT, name="2", status=Complaint.Status.UPLOADED)
        Complaint.objects.create(kind=Complaint.Kind.INQUIRY, name="3")
        Circular.objects.create(title="قديم مثبت", body="-", pinned=True)
        for i in range(3):
            Circular.objects.create(title=f"تعميم {i}", body="-")
        Circular.objects.create(title="محذوف", body="-", is_active=False)

    def get(self, user):
        self.client.force_authenticate(user)
        return self.client.get(URL)

    def test_signed_in_only(self):
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_editor_sees_every_part(self):
        data = self.get(self.editor).data
        self.assertEqual(data["urgent"], {"open": 2, "oldest_days": 5})
        self.assertEqual(data["complaints"], {"pending": 1})
        self.assertEqual(data["inquiries"], {"pending": 1})
        self.assertIsNone(data["report"])  # no report yet
        titles = [c["title"] for c in data["circulars"]]
        self.assertEqual(len(titles), 3)
        self.assertEqual(titles[0], "قديم مثبت")  # pinned first
        self.assertNotIn("محذوف", titles)

    def test_viewer_sees_only_their_parts(self):
        data = self.get(self.viewer).data
        self.assertEqual(set(data), {"water", "circulars"})

    def test_report_filled_today(self):
        DailyReport.objects.create(pk=1, report_date=timezone.localdate(), rows=[])
        self.assertEqual(self.get(self.editor).data["report"],
                         {"report_date": timezone.localdate().isoformat(), "updated_today": True})

    def test_water_today_areas_once_each(self):
        DistributionGroup.objects.all().delete()  # the table seeded by the migrations
        g1 = DistributionGroup.objects.create(days=[0, 2], sort_order=1)
        g2 = DistributionGroup.objects.create(days=[0], sort_order=2)
        g3 = DistributionGroup.objects.create(days=[3], sort_order=3)
        DistributionArea.objects.create(group=g1, name="الدرج", source="wells")
        DistributionArea.objects.create(group=g2, name="الدرج")
        DistributionArea.objects.create(group=g2, name="التفاح")
        DistributionArea.objects.create(group=g3, name="الرمال")
        with mock.patch("apps.common.home.today_info", return_value={"today": 0, "today_display": "السبت"}):
            water = self.get(self.viewer).data["water"]
        self.assertEqual(water["today_display"], "السبت")
        self.assertEqual(water["areas"], [{"name": "الدرج", "source": "wells"}, {"name": "التفاح", "source": ""}])
        self.assertEqual(water["tomorrow"]["day"], 1)
        self.assertEqual(water["tomorrow"]["areas"], [])  # nobody on day 1 (Sunday)
