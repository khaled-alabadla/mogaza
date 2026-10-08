from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models

from apps.locations.models import TrackedModel
from apps.locations.text import normalize_for_search


class Complaint(TrackedModel):
    """
    A complaint or inquiry recorded here while the municipality's main complaints system is down.
    It stays «بانتظار الرفع» until staff enter it into the main system and mark it «تم الرفع».
    Every data field is optional (whatever the caller could give); only the kind is always set.
    """

    class Kind(models.TextChoices):
        COMPLAINT = "complaint", "شكوى"
        INQUIRY = "inquiry", "استفسار"

    class Status(models.TextChoices):
        PENDING = "pending", "بانتظار الرفع"
        UPLOADED = "uploaded", "تم الرفع"

    kind = models.CharField("نوع الطلب", max_length=10, choices=Kind.choices, default=Kind.COMPLAINT)
    national_id = models.CharField("رقم الهوية", max_length=9, blank=True)
    name = models.CharField("الاسم", max_length=150, blank=True)
    phone = models.CharField("رقم الجوال", max_length=10, blank=True)
    point = models.CharField("النقطة", max_length=150, blank=True)
    building_number = models.CharField("رقم المبنى", max_length=20, blank=True)
    street_number = models.CharField("رقم الشارع", max_length=20, blank=True)
    category = models.CharField("نوع الشكوى", max_length=150, blank=True)
    address = models.CharField("العنوان", max_length=300, blank=True)

    status = models.CharField("الحالة", max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    uploaded_at = models.DateTimeField("تاريخ الرفع", null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+", verbose_name="رُفعت بواسطة")

    class Meta:
        verbose_name = "شكوى مؤقتة"
        verbose_name_plural = "الشكاوى المؤقتة"
        ordering = ["-created_at", "-id"]
        indexes = [GinIndex(fields=["search_text"], name="complaint_search_trgm", opclasses=["gin_trgm_ops"])]

    def __str__(self):
        return f"{self.get_kind_display()} — {self.name or self.category or self.pk}"

    def build_search_text(self):
        return normalize_for_search(" ".join([
            self.name, self.national_id, self.phone, self.point, self.building_number, self.street_number,
            self.category, self.address,
        ]))

    def snapshot(self):
        return {
            "kind": self.kind, "national_id": self.national_id, "name": self.name, "phone": self.phone,
            "point": self.point, "building_number": self.building_number, "street_number": self.street_number,
            "category": self.category, "address": self.address, "status": self.status, "is_active": self.is_active,
        }
