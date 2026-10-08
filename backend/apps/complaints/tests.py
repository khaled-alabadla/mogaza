from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import Complaint

URL = "/api/complaints/"
PASSWORD = "S3cure-Pass-2026"
VALID = {
    "kind": "complaint", "national_id": "401234567", "name": "محمد أحمد", "phone": "0599123456",
    "point": "نقطة الرمال", "building_number": "5A", "street_number": "1050", "category": "انقطاع مياه",
    "address": "تل الهوا - شارع القدس",
}


class ComplaintTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin1", password=PASSWORD, role=User.Role.ADMIN)
        self.editor = User.objects.create_user("editor1", password=PASSWORD, role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("viewer1", password=PASSWORD, role=User.Role.VIEWER)

    def create(self, **changes):
        self.client.force_authenticate(self.editor)
        res = self.client.post(URL, {**VALID, **changes}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_create_normalizes_and_audits(self):
        data = self.create(national_id=" ٤٠١٢٣٤٥٦٧ ", phone="+970 599-123-456", name="  محمد   أحمد ")
        self.assertEqual((data["national_id"], data["phone"], data["name"]), ("401234567", "0599123456", "محمد أحمد"))
        self.assertEqual((data["kind_display"], data["status"], data["status_display"]),
                         ("شكوى", "pending", "بانتظار الرفع"))
        self.assertEqual(data["building_number"], "5A")
        self.assertEqual(data["created_by_name"], "editor1")
        self.assertTrue(AuditLog.objects.filter(action="CREATE", entity_type="complaint",
                                                entity_id=str(data["id"])).exists())

    def test_inquiry_and_optional_fields(self):
        data = self.create(kind="inquiry", point="", building_number="", street_number="", address="")
        self.assertEqual(data["kind_display"], "استفسار")

    def test_validation_messages(self):
        self.client.force_authenticate(self.editor)
        cases = {
            "national_id": ("12345", "رقم الهوية يجب أن يتكون من 9 أرقام."),
            "phone": ("12345", "رقم الجوال غير صحيح (مثال: 0599123456)."),
            "kind": ("other", "اختر نوع الطلب: شكوى أو استفسار."),
            "name": ("   ", "الاسم مطلوب."),
            "category": ("", "نوع الشكوى مطلوب."),
            "building_number": ("5A<script>", "رقم المبنى يحتوي على رموز غير مسموحة."),
        }
        for field, (value, message) in cases.items():
            res = self.client.post(URL, {**VALID, field: value}, format="json")
            self.assertEqual(res.status_code, 400, field)
            self.assertEqual(str(res.data[field][0]), message, field)
        self.assertEqual(Complaint.objects.count(), 0)

    def test_list_filters_search_and_pending_count(self):
        a = self.create(name="سعيد خالد", kind="complaint")
        self.create(name="هالة محمود", kind="inquiry", phone="0569000000")
        self.client.post(f"{URL}mark-uploaded/", {"ids": [a["id"]]}, format="json")
        res = self.client.get(URL, {"upload": "pending"})
        self.assertEqual([r["name"] for r in res.data["results"]], ["هالة محمود"])
        self.assertEqual(res.data["pending_count"], 1)
        self.assertEqual(self.client.get(URL, {"upload": "uploaded"}).data["count"], 1)
        self.assertEqual(self.client.get(URL, {"kind": "inquiry"}).data["count"], 1)
        self.assertEqual(self.client.get(URL, {"search": "0569"}).data["results"][0]["name"], "هالة محمود")
        self.assertEqual(self.client.get(URL, {"search": "سعيد"}).data["count"], 1)

    def test_mark_uploaded_and_back(self):
        ids = [self.create()["id"], self.create(name="ثاني")["id"]]
        res = self.client.post(f"{URL}mark-uploaded/", {"ids": ids}, format="json")
        self.assertEqual(res.data["updated"], 2)
        c = Complaint.objects.get(pk=ids[0])
        self.assertEqual((c.status, c.uploaded_by), ("uploaded", self.editor))
        self.assertIsNotNone(c.uploaded_at)
        # already uploaded: nothing changes
        self.assertEqual(self.client.post(f"{URL}mark-uploaded/", {"ids": ids}, format="json").data["updated"], 0)
        res = self.client.post(f"{URL}mark-uploaded/", {"ids": [ids[0]], "uploaded": False}, format="json")
        self.assertEqual(res.data["updated"], 1)
        c.refresh_from_db()
        self.assertEqual((c.status, c.uploaded_at, c.uploaded_by), ("pending", None, None))
        self.assertEqual(self.client.post(f"{URL}mark-uploaded/", {"ids": []}, format="json").status_code, 400)

    def test_edit_and_soft_delete(self):
        pk = self.create()["id"]
        res = self.client.patch(f"{URL}{pk}/", {"category": "تسرب مياه"}, format="json")
        self.assertEqual(res.data["category"], "تسرب مياه")
        self.assertEqual(self.client.delete(f"{URL}{pk}/").status_code, 204)
        self.assertEqual(self.client.get(URL).data["count"], 0)
        self.assertFalse(Complaint.objects.get(pk=pk).is_active)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"{URL}{pk}/restore/").status_code, 200)

    def test_export_csv(self):
        self.create(name="=HYPERLINK(1)")
        self.create(name="هالة", kind="inquiry")
        res = self.client.get(f"{URL}export/", {"kind": "inquiry"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("attachment", res["Content-Disposition"])
        text = res.content.decode("utf-8")
        self.assertTrue(text.startswith("﻿"))
        lines = text.strip().splitlines()
        self.assertEqual(lines[0].lstrip("﻿").split(",")[:3], ["النوع", "رقم الهوية", "الاسم"])
        self.assertEqual(len(lines), 2)
        self.assertIn("هالة", lines[1])
        everything = self.client.get(f"{URL}export/").content.decode("utf-8")
        self.assertIn("'=HYPERLINK(1)", everything)  # formula injection neutralized

    @override_settings(PUBLIC_SEARCH_ENABLED=True)
    def test_viewers_and_anonymous_have_no_access(self):
        pk = self.create()["id"]
        for user in (self.viewer, None):
            self.client.force_authenticate(user)
            for res in (self.client.get(URL), self.client.get(f"{URL}{pk}/"), self.client.get(f"{URL}export/"),
                        self.client.post(URL, VALID, format="json"),
                        self.client.post(f"{URL}mark-uploaded/", {"ids": [pk]}, format="json"),
                        self.client.delete(f"{URL}{pk}/")):
                self.assertEqual(res.status_code, 403)
