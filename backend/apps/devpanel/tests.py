import re
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import DevLoginCode, SiteContent

DEV = "dev@example.com"
REQUEST = "/api/dev/otp/request/"
VERIFY = "/api/dev/otp/verify/"


def sent_code():
    return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)


@override_settings(DEVELOPER_EMAIL=DEV, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class DevLoginTests(APITestCase):
    def setUp(self):
        cache.clear()  # the OTP throttle counts in the cache
        self.dev = User.objects.create_superuser("dev", email=DEV, password="x-unused-1")
        self.admin = User.objects.create_user("admin1", password="pass1234", role=User.Role.ADMIN)

    def test_code_is_sent_only_to_the_developer_email(self):
        res = self.client.post(REQUEST, {"email": "someone@example.com"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)
        res2 = self.client.post(REQUEST, {"email": "DEV@example.com"})
        self.assertEqual(res2.data, res.data)  # same answer: the address can't be guessed
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [DEV])
        self.assertFalse(DevLoginCode.objects.filter(code_hash__contains=sent_code()).exists())  # never stored in clear

    def test_right_code_logs_the_developer_in_once(self):
        self.client.post(REQUEST, {"email": DEV})
        code = sent_code()
        res = self.client.post(VERIFY, {"email": DEV, "code": code})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["user"]["is_superuser"])
        self.assertEqual(self.client.get("/api/auth/me/").data["user"]["username"], "dev")
        self.client.logout()
        self.assertEqual(self.client.post(VERIFY, {"email": DEV, "code": code}).status_code, 400)  # one use

    def test_wrong_codes_lock_the_code(self):
        self.client.post(REQUEST, {"email": DEV})
        code = sent_code()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(self.client.post(VERIFY, {"email": DEV, "code": wrong}).status_code, 400)
        self.assertEqual(self.client.post(VERIFY, {"email": DEV, "code": code}).status_code, 400)

    def test_expired_and_replaced_codes_fail(self):
        self.client.post(REQUEST, {"email": DEV})
        first = sent_code()
        self.client.post(REQUEST, {"email": DEV})
        self.assertEqual(self.client.post(VERIFY, {"email": DEV, "code": first}).status_code, 400)  # replaced
        second = sent_code()
        DevLoginCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.post(VERIFY, {"email": DEV, "code": second}).status_code, 400)

    def test_content_is_public_to_read_and_developer_only_to_write(self):
        url = "/api/dev/content/login.welcome/"
        self.assertEqual(self.client.put(url, {"value": "أهلاً"}, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)  # an administrator is not the developer
        self.assertEqual(self.client.put(url, {"value": "أهلاً"}, format="json").status_code, 403)
        self.client.force_authenticate(self.dev)
        self.assertEqual(self.client.put(url, {"value": "أهلاً"}, format="json").status_code, 200)
        self.assertEqual(self.client.put("/api/dev/content/guide.sections/", {"value": [{"id": "a"}]}, format="json").status_code, 200)
        self.assertEqual(self.client.put("/api/dev/content/Bad Key/", {"value": "x"}, format="json").status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/content/").data, {"guide.sections": [{"id": "a"}], "login.welcome": "أهلاً"})
        self.client.force_authenticate(self.dev)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(SiteContent.objects.filter(key="login.welcome").exists())

    def test_developer_actions_stay_hidden_from_administrators(self):
        self.client.force_authenticate(self.dev)
        self.client.put("/api/dev/content/login.welcome/", {"value": "أهلاً"}, format="json")
        self.assertTrue(AuditLog.objects.filter(entity_type="sitecontent").exists())
        self.client.force_authenticate(self.admin)
        logs = self.client.get("/api/audit-logs/").data["results"]
        self.assertFalse([log for log in logs if log["entity_type"] == "sitecontent"])
