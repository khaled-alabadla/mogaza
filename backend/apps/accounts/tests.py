from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.audit.models import AuditLog

from .models import User

PASSWORD = "S3cure-Pass-2026"


class AuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("editor1", "editor1@example.com", PASSWORD, role=User.Role.EDITOR)

    def test_me_anonymous(self):
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["user"])
        self.assertIn("csrftoken", res.cookies)

    def test_login_with_username(self):
        for identifier in ("editor1", "EDITOR1"):
            client = APIClient()
            res = client.post("/api/auth/login/", {"username": identifier, "password": PASSWORD})
            self.assertEqual(res.status_code, 200, res.data)
            self.assertEqual(res.data["user"]["role"], "editor")
            self.assertTrue(res.data["user"]["can_edit"])
            self.assertEqual(client.get("/api/auth/me/").data["user"]["username"], "editor1")
        self.assertEqual(AuditLog.objects.filter(action="LOGIN", user=self.user).count(), 2)

    def test_login_with_email_is_not_allowed(self):
        res = self.client.post("/api/auth/login/", {"username": "editor1@example.com", "password": PASSWORD})
        self.assertEqual(res.status_code, 400)

    def test_change_own_password(self):
        self.client.post("/api/auth/login/", {"username": "editor1", "password": PASSWORD})
        url = "/api/auth/change-password/"
        res = self.client.post(url, {"current_password": "wrong", "new_password": "Another-Pass-2026"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("current_password", res.data)
        res = self.client.post(url, {"current_password": PASSWORD, "new_password": "123"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("new_password", res.data)
        res = self.client.post(url, {"current_password": PASSWORD, "new_password": "Another-Pass-2026"})
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Another-Pass-2026"))
        # still logged in after the change
        self.assertEqual(self.client.get("/api/auth/me/").data["user"]["username"], "editor1")

    def test_change_password_requires_login(self):
        res = self.client.post("/api/auth/change-password/", {"current_password": "a", "new_password": "b"})
        self.assertEqual(res.status_code, 403)

    def test_wrong_password(self):
        res = self.client.post("/api/auth/login/", {"username": "editor1", "password": "wrong"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "اسم المستخدم أو كلمة المرور غير صحيحة.")
        self.assertTrue(AuditLog.objects.filter(action="LOGIN_FAILED", username="editor1").exists())

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        res = self.client.post("/api/auth/login/", {"username": "editor1", "password": PASSWORD})
        self.assertEqual(res.status_code, 400)

    def test_empty_fields_arabic_errors(self):
        res = self.client.post("/api/auth/login/", {"username": "", "password": ""})
        self.assertEqual(res.status_code, 400)
        self.assertIn("username", res.data)
        self.assertIn("password", res.data)

    def test_logout(self):
        self.client.post("/api/auth/login/", {"username": "editor1", "password": PASSWORD})
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertIsNone(self.client.get("/api/auth/me/").data["user"])

    def test_csrf_enforced_for_session_requests(self):
        client = APIClient(enforce_csrf_checks=True)
        client.get("/api/auth/me/")
        res = client.post("/api/auth/login/", {"username": "editor1", "password": PASSWORD})
        self.assertEqual(res.status_code, 200)
        # Without the CSRF header, a mutating request is rejected.
        res = client.post("/api/locations/", {"place_name": "x"})
        self.assertEqual(res.status_code, 403)
        res = client.post("/api/locations/", {"place_name": "x"}, HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(res.status_code, 201)

    def test_login_is_rate_limited(self):
        from unittest import mock

        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"login": "3/min"}):
            codes = [self.client.post("/api/auth/login/", {"username": "x", "password": "y"}).status_code
                     for _ in range(5)]
        self.assertIn(429, codes)
        cache.clear()

    def test_login_rate_limit_ignores_spoofed_forwarded_for(self):
        from unittest import mock

        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"login": "3/min"}):
            codes = [self.client.post("/api/auth/login/", {"username": "x", "password": "y"},
                                      HTTP_X_FORWARDED_FOR=f"10.0.0.{i}").status_code for i in range(5)]
        self.assertEqual(codes[-1], 429)
        cache.clear()

    def test_deactivation_and_password_reset_end_running_sessions(self):
        admin = User.objects.create_user("admin1", password=PASSWORD, role=User.Role.ADMIN)
        admin_client = APIClient()
        admin_client.force_authenticate(admin)
        for change in ({"is_active": False}, {"password": "Another-Pass-2026"}):
            self.user.refresh_from_db()
            self.user.is_active = True
            self.user.save()
            self.client.force_login(self.user)
            self.assertEqual(admin_client.patch(f"/api/users/{self.user.pk}/", change).status_code, 200)
            self.assertIsNone(self.client.get("/api/auth/me/").data["user"], change)
            self.assertEqual(self.client.post("/api/locations/", {"place_name": "x"}).status_code, 403, change)

    def test_superuser_is_admin_role(self):
        su = User.objects.create_superuser("root", "root@example.com", PASSWORD)
        self.assertEqual(su.role, User.Role.ADMIN)


class UserManagementTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin1", password=PASSWORD, role=User.Role.ADMIN)
        self.editor = User.objects.create_user("editor1", password=PASSWORD, role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("viewer1", password=PASSWORD, role=User.Role.VIEWER)

    def test_non_admins_forbidden(self):
        for user in (self.editor, self.viewer):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/users/").status_code, 403)
            self.assertEqual(self.client.post("/api/users/", {"username": "n", "password": PASSWORD}).status_code, 403)
            self.assertEqual(self.client.get("/api/audit-logs/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)

    def test_admin_crud_users(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/users/")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("password", res.data["results"][0])

        res = self.client.post("/api/users/", {"username": "new1", "password": PASSWORD, "role": "editor",
                                               "first_name": "سليمان"})
        self.assertEqual(res.status_code, 201, res.data)
        new_id = res.data["id"]
        self.assertTrue(User.objects.get(pk=new_id).check_password(PASSWORD))
        self.assertNotIn(PASSWORD, str(AuditLog.objects.filter(entity_type="user").values()))

        res = self.client.patch(f"/api/users/{new_id}/", {"role": "viewer"})
        self.assertEqual(res.data["role"], "viewer")

        res = self.client.patch(f"/api/users/{new_id}/", {"password": "Another-Pass-2026"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(User.objects.get(pk=new_id).check_password("Another-Pass-2026"))

        res = self.client.patch(f"/api/users/{new_id}/", {"is_active": False})
        self.assertFalse(res.data["is_active"])  # deactivate / reactivate
        res = self.client.patch(f"/api/users/{new_id}/", {"is_active": True, "role": "admin"})
        self.assertEqual((res.data["is_active"], res.data["role"]), (True, "admin"))

        self.assertEqual(self.client.delete(f"/api/users/{new_id}/").status_code, 204)
        self.assertFalse(User.objects.filter(pk=new_id).exists())  # permanently deleted
        self.assertTrue(AuditLog.objects.filter(action="DELETE", entity_type="user", entity_id=str(new_id)).exists())

    def test_deleting_user_keeps_their_audit_history_and_locations(self):
        self.client.force_authenticate(self.editor)
        loc_id = self.client.post("/api/locations/", {"place_name": "موقع"}).data["id"]
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f"/api/users/{self.editor.pk}/").status_code, 204)
        entry = AuditLog.objects.get(action="CREATE", entity_type="location", entity_id=str(loc_id))
        self.assertEqual(entry.username, "editor1")
        self.assertEqual(self.client.get(f"/api/locations/{loc_id}/").status_code, 200)

    def test_admin_changes_own_password_and_stays_logged_in(self):
        self.client.login(username="admin1", password=PASSWORD)
        res = self.client.patch(f"/api/users/{self.admin.pk}/", {"password": "Another-Pass-2026"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/").data["user"]["username"], "admin1")

    def test_weak_password_and_duplicate_username_rejected(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post("/api/users/", {"username": "x2", "password": "123"}).status_code, 400)
        self.assertEqual(self.client.post("/api/users/", {"username": "EDITOR1", "password": PASSWORD}).status_code,
                         400)
        self.assertEqual(self.client.post("/api/users/", {"username": "x3"}).status_code, 400)

    def test_admin_cannot_lock_self_out(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f"/api/users/{self.admin.pk}/").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"role": "viewer"}).status_code, 400)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"is_active": False}).status_code, 400)

    def test_privilege_fields_cannot_be_mass_assigned(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/users/", {"username": "new1", "password": PASSWORD, "is_staff": True,
                                               "is_superuser": True, "groups": [1], "last_login": "2020-01-01"},
                               format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.client.patch(f"/api/users/{self.viewer.pk}/", {"is_staff": True, "is_superuser": True}, format="json")
        self.client.force_authenticate(self.viewer)
        self.client.post("/api/auth/change-password/", {"current_password": PASSWORD,
                                                        "new_password": "Another-Pass-2026", "role": "admin"})
        for user in User.objects.filter(username__in=["new1", "viewer1"]):
            self.assertEqual((user.is_staff, user.is_superuser, user.groups.count(), user.last_login),
                             (False, False, 0, None), user.username)
        self.assertEqual(User.objects.get(username="viewer1").role, User.Role.VIEWER)

    def test_admin_only_endpoints_stay_closed_with_public_search(self):
        with override_settings(PUBLIC_SEARCH_ENABLED=True):
            for url in ("/api/users/", f"/api/users/{self.viewer.pk}/", "/api/audit-logs/"):
                self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_invalid_role_rejected(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/users/", {"username": "z", "password": PASSWORD, "role": "superuser"})
        self.assertEqual(res.status_code, 400)


class AuditLogApiTests(APITestCase):
    def test_admin_can_filter_audit_logs(self):
        admin = User.objects.create_user("admin1", password=PASSWORD, role=User.Role.ADMIN)
        self.client.force_authenticate(admin)
        self.client.post("/api/locations/", {"place_name": "مسجد الوحدة"})
        res = self.client.get("/api/audit-logs/", {"action": "CREATE", "entity_type": "location"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        entry = res.data["results"][0]
        self.assertEqual((entry["username"], entry["entity_repr"], entry["action_display"]),
                         ("admin1", "مسجد الوحدة", "إضافة"))
        self.assertIsNotNone(entry["timestamp"])
        # Audit log is read-only through the API.
        self.assertEqual(self.client.delete(f"/api/audit-logs/{entry['id']}/").status_code, 405)


class SuperuserProtectionTests(APITestCase):
    """Only a superuser may change, deactivate, reset the password of, or delete a superuser."""

    def setUp(self):
        self.root = User.objects.create_superuser("root", "root@example.com", PASSWORD)
        self.admin = User.objects.create_user("admin1", password=PASSWORD, role=User.Role.ADMIN)

    def test_regular_admin_cannot_touch_a_superuser(self):
        self.client.force_authenticate(self.admin)
        url = f"/api/users/{self.root.pk}/"
        for payload in ({"password": "Another-Pass-2026"}, {"is_active": False}, {"role": "viewer"},
                        {"first_name": "x"}):
            res = self.client.patch(url, payload)
            self.assertEqual(res.status_code, 403, payload)
            self.assertEqual(res.data["detail"], "لا يمكن تعديل حساب المدير الأعلى أو حذفه إلا من قِبله.")
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.root.refresh_from_db()
        self.assertTrue(self.root.check_password(PASSWORD))
        self.assertTrue(self.root.is_active)
        self.assertEqual(self.root.first_name, "")
        self.assertFalse(AuditLog.objects.filter(entity_type="user", entity_id=str(self.root.pk)).exists())
        # reading the list is still fine and flags the protected account
        listed = {u["username"]: u for u in self.client.get("/api/users/").data["results"]}
        self.assertTrue(listed["root"]["is_superuser"])
        self.assertFalse(listed["admin1"]["is_superuser"])

    def test_superuser_can_manage_admins_and_itself(self):
        self.client.force_authenticate(self.root)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"is_active": False}).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/users/{self.root.pk}/", {"first_name": "بلال"}).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/users/{self.admin.pk}/").status_code, 204)

    def test_superuser_flag_cannot_be_set_through_the_api(self):
        self.client.force_authenticate(self.root)
        res = self.client.patch(f"/api/users/{self.admin.pk}/", {"is_superuser": True})
        self.assertEqual(res.status_code, 200)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_superuser)
