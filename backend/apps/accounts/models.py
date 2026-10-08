from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "مدير النظام"
        EDITOR = "editor", "محرر"
        VIEWER = "viewer", "مشاهد"

    role = models.CharField("الدور", max_length=10, choices=Role.choices, default=Role.VIEWER)

    class Meta:
        verbose_name = "مستخدم"
        verbose_name_plural = "المستخدمون"
        ordering = ["username"]

    def save(self, *args, **kwargs):
        # Superusers created with `createsuperuser` are always administrators.
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def is_admin_role(self):
        return self.is_active and self.role == self.Role.ADMIN

    @property
    def can_edit_locations(self):
        return self.is_active and self.role in (self.Role.ADMIN, self.Role.EDITOR)
