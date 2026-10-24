from django.conf import settings
from django.db import models


class SiteContent(models.Model):
    """
    A text (or a JSON block, e.g. «دليل القسم») of the site edited from the developer dashboard.
    The site ships its own defaults; a row here overrides one of them, deleting it restores the default.
    """

    key = models.CharField("المفتاح", max_length=100, primary_key=True)
    value = models.JSONField("القيمة")
    updated_at = models.DateTimeField("آخر تعديل", auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+", verbose_name="عدّله")

    class Meta:
        verbose_name = "محتوى الموقع"
        verbose_name_plural = "محتوى الموقع"
        ordering = ["key"]

    def __str__(self):
        return self.key


class DevLoginCode(models.Model):
    """A one-time code e-mailed to the developer to open «/dashboard» (stored as an HMAC, never in clear)."""

    email = models.EmailField("البريد", db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "رمز دخول المطوّر"
        verbose_name_plural = "رموز دخول المطوّر"
        ordering = ["-created_at"]
