from datetime import date, time
from unittest import mock

from django.db import connection
from django.test import SimpleTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.locations.models import Location, StreetName
from apps.water.models import DistributionArea, DistributionGroup, Neighborhood, WaterSlot, WaterZone, today_info
from apps.water.serializers import slot_data

from .params import bool_param, int_param, text_param
from .validation import exclude_instance, required_text


def request_with(query):
    return Request(APIRequestFactory().get("/", query))


class ParamTests(SimpleTestCase):
    def test_text_param(self):
        self.assertEqual(text_param(request_with({"q": "  مسجد  "}), "q"), "مسجد")
        self.assertEqual(text_param(request_with({}), "q"), "")
        self.assertEqual(text_param(request_with({"q": "مس\x00جد"}), "q"), "مسجد")  # PostgreSQL rejects NUL

    def test_int_param(self):
        self.assertEqual(int_param(request_with({"n": " 12 "}), "n"), 12)
        self.assertEqual(int_param(request_with({"n": "١٢"}), "n"), 12)  # Arabic-Indic digits
        self.assertIsNone(int_param(request_with({}), "n"))
        for bad in ("", "abc", "-1", "1.5", "²"):  # "²" passes str.isdigit() but int() rejects it
            self.assertIsNone(int_param(request_with({"n": bad}), "n"), bad)

    def test_int_param_range(self):
        self.assertEqual(int_param(request_with({"d": "6"}), "d", 0, 6), 6)
        self.assertEqual(int_param(request_with({"d": "0"}), "d", 0, 6), 0)
        self.assertIsNone(int_param(request_with({"d": "7"}), "d", 0, 6))

    def test_bool_param(self):
        for value in ("1", "true", "yes"):
            self.assertTrue(bool_param(request_with({"b": value}), "b"))
        for value in ("0", "false", "", "True", " 1"):
            self.assertFalse(bool_param(request_with({"b": value}), "b"), value)
        self.assertFalse(bool_param(request_with({}), "b"))


class ValidationTests(APITestCase):
    def test_required_text(self):
        self.assertEqual(required_text("  مجلس   الوزراء ", "اسم المكان"), "مجلس الوزراء")
        with self.assertRaises(serializers.ValidationError) as ctx:
            required_text("   ", "اسم المكان")
        self.assertEqual(ctx.exception.detail, ["اسم المكان مطلوب."])
        with self.assertRaises(serializers.ValidationError):
            required_text("\u200b\ufeff \u00a0", "اسم المكان")  # invisible characters only

    def test_exclude_instance(self):
        a = User.objects.create_user("a", password="S3cure-Pass-2026")
        User.objects.create_user("b", password="S3cure-Pass-2026")
        self.assertEqual(exclude_instance(User.objects.all(), None).count(), 2)
        self.assertEqual(list(exclude_instance(User.objects.all(), a).values_list("username", flat=True)), ["b"])


class WaterHelperTests(SimpleTestCase):
    def test_slot_data_shape(self):
        slot = WaterSlot(id=5, day=2, start_time=time(9, 0, 30), end_time=time(12, 0), note="ملاحظة")
        self.assertEqual(slot_data(slot), {"id": 5, "day": 2, "day_display": "الاثنين", "start_time": "09:00",
                                           "end_time": "12:00", "note": "ملاحظة"})

    @mock.patch("apps.water.models.timezone.localdate", return_value=date(2026, 10, 3))  # a Saturday
    def test_today_info(self, _):
        self.assertEqual(today_info(), {"today": 0, "today_display": "السبت"})


class ListQueryCountTests(APITestCase):
    """
    The hot list endpoints run a fixed number of SQL queries whatever the number of rows (no N+1).
    force_authenticate is used, so no session/user lookups are counted.
    """

    EXPECTED = {
        "/api/locations/": 3,                      # count + page (joined) + zone slots
        "/api/locations/?search=مسجد": 3,
        "/api/streets/?search=شارع": 2,            # count + page
        "/api/water-table/": 2,                    # rows + areas
        "/api/users/": 2,                          # count + page
        "/api/audit-logs/": 2,                     # count + page (no join)
        "/api/neighborhoods/": 1,                  # one annotated query
        "/api/water-zones/": 3,                    # count + page + slots
    }

    def setUp(self):
        self.admin = User.objects.create_user("admin", password="S3cure-Pass-2026", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)
        self.batch = 0

    def add_rows(self, n):
        """n more rows in every listed table, each location with its own zone (two slots) and editors."""
        for _ in range(n):
            self.batch += 1
            i = self.batch
            editor = User.objects.create_user(f"editor{i}", password="S3cure-Pass-2026", role=User.Role.EDITOR)
            hood = Neighborhood.objects.create(name=f"حي اختبار {i}")
            zone = WaterZone.objects.create(neighborhood=hood, name=f"منطقة {i}", code=str(i))
            WaterSlot.objects.create(zone=zone, day=0, start_time=time(8), end_time=time(10))
            WaterSlot.objects.create(zone=zone, day=3, start_time=time(8), end_time=time(10))
            location = Location.objects.create(place_name=f"مسجد رقم {i}", neighborhood=hood, water_zone=zone,
                                               created_by=editor, updated_by=self.admin)
            StreetName.objects.create(common_name=f"شارع {i}", official_name=f"شارع رسمي {i}",
                                      created_by=editor, updated_by=editor)
            group = DistributionGroup.objects.create(days=[i % 7], sort_order=100 + i)
            DistributionArea.objects.create(group=group, name=f"عنوان {i}")
            log_action("UPDATE", user=editor, entity=location, before={"a": 1}, after={"a": 2})

    def counts(self):
        result = {}
        for url in self.EXPECTED:
            with CaptureQueriesContext(connection) as ctx:
                response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
            result[url] = len(ctx.captured_queries)
        return result

    def test_query_count_is_independent_of_row_count(self):
        self.add_rows(2)
        small = self.counts()
        self.add_rows(8)
        self.assertEqual(self.counts(), small)
        self.assertEqual(small, self.EXPECTED)

    def test_detail_query_counts(self):
        self.add_rows(3)
        location, zone = Location.objects.last(), WaterZone.objects.last()
        expected = {
            f"/api/locations/{location.pk}/": 2,                          # row (joined) + zone slots
            f"/api/streets/{StreetName.objects.last().pk}/": 1,
            f"/api/water-table/{DistributionGroup.objects.last().pk}/": 2,  # row + areas
            f"/api/neighborhoods/{zone.neighborhood_id}/": 1,
            f"/api/water-zones/{zone.pk}/": 3,                            # row + slots + locations
            f"/api/users/{self.admin.pk}/": 1,
            f"/api/audit-logs/{AuditLog.objects.last().pk}/": 1,
        }
        actual = {}
        for url in expected:
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.client.get(url).status_code, 200, url)
            actual[url] = len(ctx.captured_queries)
        self.assertEqual(actual, expected)
        # create with a zone: zone + its slots (one query for both schedule fields) + insert + audit
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.post("/api/locations/", {"place_name": "موقع", "water_zone": zone.pk}, format="json")
        self.assertEqual(res.data["water_schedule_text"], "السبت، الثلاثاء 08:00–10:00")
        self.assertEqual(len(ctx.captured_queries), 4)


class BadQueryParamTests(APITestCase):
    """Malformed filter values are ignored (or a 404 for pages), never a server error."""

    def test_no_server_errors(self):
        self.client.force_authenticate(User.objects.create_user("admin", password="S3cure-Pass-2026",
                                                                role=User.Role.ADMIN))
        huge = "9" * 30
        urls = [f"/api/locations/?neighborhood=²&water_zone={huge}", f"/api/water-zones/?day=²&neighborhood={huge}",
                "/api/water-zones/summary/?neighborhood=²", f"/api/audit-logs/?entity_id={huge}"]
        urls += [f"{url}?{param}=a%00b" for url, param in (
            ("/api/locations/", "search"), ("/api/streets/", "search"), ("/api/water-zones/", "search"),
            ("/api/users/", "search"), ("/api/audit-logs/", "user"), ("/api/audit-logs/", "action"))]
        for url in urls:
            self.assertEqual(self.client.get(url).status_code, 200, url)
        self.assertEqual(self.client.get(f"/api/locations/{huge}/").status_code, 404)
