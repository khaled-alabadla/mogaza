from rest_framework.test import APITestCase

from apps.accounts.models import User

URL = "/api/circulars/"


class CircularTests(APITestCase):
    def setUp(self):
        self.editor = User.objects.create_user("ed", password="pass1234", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("vw", password="pass1234", role=User.Role.VIEWER)
        self.client.force_authenticate(self.editor)

    def test_first_circular_is_preloaded_and_searchable(self):
        res = self.client.get(URL)
        self.assertEqual(res.data["count"], 1)
        self.assertIn("0595322040", res.data["results"][0]["body"])
        self.assertEqual(self.client.get(URL, {"search": "الكهربا"}).data["count"], 1)
        self.assertEqual(self.client.get(URL, {"search": "مياه"}).data["count"], 0)

    def test_add_edit_delete_and_pinned_first(self):
        res = self.client.post(URL, {"title": " تعميم جديد ", "body": " سطر أول \n\n سطر ثانٍ "}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["title"], res.data["body"]), ("تعميم جديد", "سطر أول\n\nسطر ثانٍ"))
        new = res.data["id"]
        first = self.client.get(URL).data["results"][0]["id"]
        self.assertEqual(first, new)  # the latest first
        old = self.client.get(URL).data["results"][1]["id"]
        self.client.patch(f"{URL}{old}/", {"pinned": True}, format="json")
        self.assertEqual(self.client.get(URL).data["results"][0]["id"], old)  # pinned on top
        self.assertEqual(self.client.delete(f"{URL}{new}/").status_code, 204)
        self.assertEqual(self.client.get(URL).data["count"], 1)

    def test_validation_and_permissions(self):
        self.assertEqual(self.client.post(URL, {"title": "", "body": "x"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(URL, {"title": "x", "body": "  "}, format="json").status_code, 400)
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(URL).status_code, 200)
        self.assertEqual(self.client.post(URL, {"title": "x", "body": "y"}, format="json").status_code, 403)
