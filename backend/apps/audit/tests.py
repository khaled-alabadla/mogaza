from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User

from .models import AuditLog

PASSWORD = "S3cure-Pass-2026"
URL = "/api/audit-logs/"


class HiddenSuperuserAuditTests(APITestCase):
    """The developer's (superuser) account is hidden, so its audit trail is hidden from other admins too."""

    def setUp(self):
        self.root = User.objects.create_superuser("root", "root@example.com", PASSWORD)
        self.admin = User.objects.create_user("admin1", password=PASSWORD, role=User.Role.ADMIN)
        root_client, admin_client = APIClient(), APIClient()
        root_client.post("/api/auth/login/", {"username": "root", "password": PASSWORD})
        root_client.post("/api/locations/", {"place_name": "موقع أضافه المطور"})        # root's edit
        root_client.patch(f"/api/users/{self.root.pk}/", {"first_name": "مطور"})            # change to root itself
        root_client.post("/api/auth/logout/")
        APIClient().post("/api/auth/login/", {"username": "ROOT", "password": "wrong"})       # failed, as typed
        admin_client.post("/api/auth/login/", {"username": "admin1", "password": PASSWORD})
        admin_client.post("/api/locations/", {"place_name": "موقع أضافه المدير"})

    def entries(self, user):
        self.client.force_authenticate(user)
        return [(e["action"], e["username"], e["entity_repr"]) for e in self.client.get(URL).data["results"]]

    def test_other_admins_see_no_trace_of_the_superuser(self):
        entries = self.entries(self.admin)
        self.assertTrue(entries)
        self.assertFalse([e for e in entries if e[1].lower() == "root" or "المطور" in e[2] or "مطور" in e[2]],
                         entries)
        self.assertIn(("CREATE", "admin1", "موقع أضافه المدير"), entries)
        self.assertIn(("LOGIN", "admin1", ""), entries)
        # filtering / searching / opening an entry directly does not reveal it either
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(URL, {"user": "root"}).data["count"], 0)
        hidden = AuditLog.objects.filter(username="root").first()
        self.assertEqual(self.client.get(f"{URL}{hidden.pk}/").status_code, 404)

    def test_the_superuser_sees_everything(self):
        entries = self.entries(self.root)
        for expected in (("LOGIN", "root", ""), ("CREATE", "root", "موقع أضافه المطور"), ("LOGOUT", "root", ""),
                         ("LOGIN_FAILED", "ROOT", "")):
            self.assertIn(expected, entries)
        self.assertTrue([e for e in entries if e[0] == "UPDATE" and e[1] == "root"])
