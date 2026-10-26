from rest_framework.test import APITestCase

from apps.accounts.models import User

from .models import CommitteeRep

URL = "/api/committees/"


class CommitteeRepTests(APITestCase):
    def setUp(self):
        self.editor = User.objects.create_user("ed", password="pass1234", role=User.Role.EDITOR)
        self.viewer = User.objects.create_user("vw", password="pass1234", role=User.Role.VIEWER)
        self.client.force_authenticate(self.editor)

    def test_the_department_list_is_preloaded(self):
        res = self.client.get(URL, {"page_size": 50})
        self.assertEqual(res.data["count"], 12)
        self.assertEqual(res.data["results"][0]["committee"], "لجنة حي الشجاعية")

    def test_search_add_edit_delete(self):
        self.assertEqual(self.client.get(URL, {"search": "الزيتون"}).data["count"], 1)
        self.assertEqual(self.client.get(URL, {"search": "0599419311"}).data["count"], 1)
        res = self.client.post(URL, {"name": " أحمد  سالم ", "committee": "لجنة حي النصر", "phone": "+970 599-111-222"},
                               format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["name"], res.data["phone"]), ("أحمد سالم", "0599111222"))
        rep = res.data["id"]
        self.assertEqual(self.client.patch(f"{URL}{rep}/", {"phone": "0599000000"}, format="json").data["phone"], "0599000000")
        self.assertEqual(self.client.delete(f"{URL}{rep}/").status_code, 204)
        self.assertFalse(CommitteeRep.objects.get(pk=rep).is_active)  # soft delete
        self.assertEqual(self.client.get(URL).data["count"], 12)

    def test_validation(self):
        self.assertEqual(self.client.post(URL, {"name": "", "committee": "x"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(URL, {"name": "x", "committee": "y", "phone": "123"}, format="json").status_code, 400)

    def test_viewers_read_only(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(URL).status_code, 200)
        self.assertEqual(self.client.post(URL, {"name": "x", "committee": "y"}, format="json").status_code, 403)
        self.viewer.permissions = ["search.view"]
        self.viewer.save()
        self.assertEqual(self.client.get(URL).status_code, 403)
