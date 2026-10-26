from django.contrib.auth.models import AbstractUser
from django.db import models

# Pages / options an administrator can grant per user: (key, Arabic label, group = the page).
# The users and audit-log pages are not in the catalog: they stay for administrators only.
PERMISSIONS = [
    ("search.view", "عرض البحث عن المواقع", "البحث عن المواقع"),
    ("search.edit", "إضافة وتعديل وحذف المواقع والشوارع", "البحث عن المواقع"),
    ("water.view", "عرض جدول المياه", "جدول المياه"),
    ("water.edit", "تعديل جدول المياه", "جدول المياه"),
    ("complaints.view", "عرض الشكاوى", "الشكاوى"),
    ("complaints.edit", "إضافة وتعديل وحذف الشكاوى وتعليمها «تم الرفع»", "الشكاوى"),
    ("complaints.export", "تصدير الشكاوى (Excel / PDF)", "الشكاوى"),
    ("inquiries.view", "عرض الاستفسارات", "الاستفسارات"),
    ("inquiries.edit", "إضافة وتعديل وحذف الاستفسارات وتعليمها «تم الرفع»", "الاستفسارات"),
    ("inquiries.export", "تصدير الاستفسارات (Excel / PDF)", "الاستفسارات"),
    ("urgent.view", "عرض الشكاوى العاجلة", "الشكاوى العاجلة"),
    ("urgent.edit", "إضافة وتعديل وحذف الشكاوى العاجلة وتعليمها «تم الحل»", "الشكاوى العاجلة"),
    ("urgent.export", "تصدير الشكاوى العاجلة (Excel)", "الشكاوى العاجلة"),
    ("report.view", "عرض التقرير اليومي", "التقرير اليومي"),
    ("report.edit", "تعبئة التقرير اليومي وتعديله", "التقرير اليومي"),
    ("guide.view", "عرض دليل القسم", "دليل القسم"),
    ("committees.view", "عرض ممثلي لجان الأحياء", "لجان الأحياء"),
    ("committees.edit", "إضافة وتعديل وحذف ممثلي لجان الأحياء", "لجان الأحياء"),
    ("circulars.view", "عرض التعميمات", "التعميمات"),
    ("circulars.edit", "إضافة وتعديل وحذف التعميمات", "التعميمات"),
]
PERMISSION_KEYS = [key for key, _, _ in PERMISSIONS]

# What a user of each role gets while their `permissions` is null (= never customized).
ROLE_DEFAULTS = {
    "admin": PERMISSION_KEYS,
    "editor": PERMISSION_KEYS,
    "viewer": ["search.view", "water.view", "guide.view", "committees.view", "circulars.view"],
}


def ordered_permissions(keys):
    """The given keys without duplicates, in catalog order (unknown keys dropped)."""
    wanted = set(keys)
    return [key for key in PERMISSION_KEYS if key in wanted]


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "مدير النظام"
        EDITOR = "editor", "محرر"
        VIEWER = "viewer", "مشاهد"

    role = models.CharField("الدور", max_length=10, choices=Role.choices, default=Role.VIEWER)
    # Keys from PERMISSIONS ticked by an administrator; null = the role's defaults (ROLE_DEFAULTS).
    permissions = models.JSONField("الصلاحيات", null=True, blank=True)

    class Meta:
        verbose_name = "مستخدم"
        verbose_name_plural = "المستخدمون"
        ordering = ["username"]

    def save(self, *args, **kwargs):
        # Superusers created with `createsuperuser` are always administrators.
        if self.is_superuser:
            self.role = self.Role.ADMIN
        # An administrator has every permission: nothing to store.
        if self.role == self.Role.ADMIN:
            self.permissions = None
        super().save(*args, **kwargs)

    @property
    def is_admin_role(self):
        return self.is_active and self.role == self.Role.ADMIN

    @property
    def effective_permissions(self):
        """The permission keys this user actually has (catalog order)."""
        if not self.is_active:
            return []
        if self.role == self.Role.ADMIN:
            return list(PERMISSION_KEYS)
        if self.permissions is None:
            return list(ROLE_DEFAULTS.get(self.role, []))
        return ordered_permissions(self.permissions if isinstance(self.permissions, list) else [])

    def has_perm_key(self, key):
        return key in self.effective_permissions

    @property
    def can_edit_locations(self):
        return self.has_perm_key("search.edit")
