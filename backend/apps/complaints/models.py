from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models

from apps.locations.models import TrackedModel
from apps.locations.text import normalize_for_search


# Text fields a search matches (name, numbers, type, source, place, details …).
SEARCH_FIELDS = ("name", "national_id", "phone", "category", "channel", "area", "details", "point",
                 "building_number", "street_number", "subscription", "address")


class Complaint(TrackedModel):
    """
    A complaint or inquiry recorded here while the municipality's main complaints system is down.
    It stays «بانتظار الرفع» until staff enter it into the main system and mark it «تم الرفع».
    Every data field is optional (whatever the caller could give); only the kind is always set.
    """

    class Kind(models.TextChoices):
        COMPLAINT = "complaint", "شكوى"
        INQUIRY = "inquiry", "استفسار"

    class Channel(models.TextChoices):
        PHONE = "phone", "اتصال هاتفي"
        FACEBOOK = "facebook", "فيسبوك"
        WHATSAPP = "whatsapp", "واتساب"

    class Status(models.TextChoices):
        PENDING = "pending", "بانتظار الرفع"
        UPLOADED = "uploaded", "تم الرفع"

    kind = models.CharField("نوع الطلب", max_length=10, choices=Kind.choices, default=Kind.COMPLAINT)
    # --- both kinds (same fields as the main system's «إضافة شكوى» / «إضافة استفسار» forms)
    national_id = models.CharField("رقم الهوية", max_length=9, blank=True)
    name = models.CharField("الاسم", max_length=150, blank=True)
    phone = models.CharField("رقم الجوال", max_length=10, blank=True)
    category = models.CharField("نوع الشكوى / الاستفسار", max_length=150, blank=True)
    channel = models.CharField("المصدر", max_length=10, choices=Channel.choices, blank=True)
    area = models.CharField("الحي / المنطقة", max_length=150, blank=True)
    details = models.TextField("نص الاستفسار / تفاصيل الشكوى", blank=True)
    # --- complaints only
    hide_identity = models.BooleanField("إخفاء بيانات صاحب الشكوى", default=False)
    point = models.CharField("رقم النقطة", max_length=150, blank=True)
    building_number = models.CharField("رقم المبنى", max_length=20, blank=True)
    street_number = models.CharField("رقم الشارع", max_length=20, blank=True)
    subscription = models.CharField("الاشتراك", max_length=50, blank=True)
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
        # the source is searchable by its Arabic label («واتساب»), not its code
        values = [self.get_channel_display() if f == "channel" else getattr(self, f) for f in SEARCH_FIELDS]
        return normalize_for_search(" ".join(str(v) for v in values))

    def snapshot(self):
        return {**{field: getattr(self, field) for field in ("kind", "hide_identity", *SEARCH_FIELDS)},
                "status": self.status, "is_active": self.is_active}
