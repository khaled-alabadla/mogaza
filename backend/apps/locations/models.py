from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models

from .text import normalize_for_search


class ActiveManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)


class TrackedModel(models.Model):
    """Common bookkeeping fields: soft delete + who/when."""

    is_active = models.BooleanField("نشط", default=True, db_index=True)
    created_at = models.DateTimeField("تاريخ الإضافة", auto_now_add=True)
    updated_at = models.DateTimeField("آخر تعديل", auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+", verbose_name="أضيف بواسطة")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+", verbose_name="عُدّل بواسطة")
    deleted_at = models.DateTimeField("تاريخ الحذف", null=True, blank=True)
    deleted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+", verbose_name="حُذف بواسطة")
    search_text = models.TextField(editable=False, default="")

    objects = models.Manager()
    active = ActiveManager()

    class Meta:
        abstract = True

    def build_search_text(self):
        raise NotImplementedError

    def save(self, *args, **kwargs):
        self.search_text = self.build_search_text()
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "search_text" not in update_fields:
            kwargs["update_fields"] = list(update_fields) + ["search_text"]
        super().save(*args, **kwargs)


class Location(TrackedModel):
    """
    A place / intersection. Numbers are stored as text on purpose: the source
    data contains values such as "55F", and leading zeros must never be lost.
    """

    place_name = models.CharField("اسم المكان / التقاطع", max_length=255)
    description = models.CharField("الوصف / الموقع", max_length=500, blank=True)
    building_number = models.CharField("رقم المبنى", max_length=20, blank=True)
    street_number = models.CharField("رقم الشارع", max_length=20, blank=True)
    neighborhood = models.ForeignKey("water.Neighborhood", null=True, blank=True, on_delete=models.PROTECT,
                                     related_name="locations", verbose_name="الحي")
    # The building's water schedule is its zone's schedule (kept in the same neighborhood by the API).
    water_zone = models.ForeignKey("water.WaterZone", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="locations", verbose_name="منطقة المياه")
    # Building centroid (WGS84), from the municipality GIS via `fetch_coordinates`. Used to describe
    # water zones relative to nearby landmarks («شرق دوار …»).
    latitude = models.DecimalField("خط العرض", max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField("خط الطول", max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        verbose_name = "موقع"
        verbose_name_plural = "المواقع"
        ordering = ["place_name", "id"]
        indexes = [
            GinIndex(fields=["search_text"], name="location_search_trgm", opclasses=["gin_trgm_ops"]),
            models.Index(fields=["place_name"], name="location_place_name_idx"),
            models.Index(fields=["building_number"], name="location_building_idx"),
            models.Index(fields=["street_number"], name="location_street_idx"),
        ]

    def __str__(self):
        return self.place_name

    def build_search_text(self):
        return normalize_for_search(" ".join([self.place_name, self.description,
                                              self.building_number, self.street_number]))

    def snapshot(self):
        return {
            "place_name": self.place_name,
            "description": self.description,
            "building_number": self.building_number,
            "street_number": self.street_number,
            "neighborhood": self.neighborhood_id,
            "neighborhood_name": self.neighborhood.name if self.neighborhood_id else None,
            "water_zone": self.water_zone_id,
            "water_zone_name": self.water_zone.display_name if self.water_zone_id else None,
            "latitude": str(self.latitude) if self.latitude is not None else None,
            "longitude": str(self.longitude) if self.longitude is not None else None,
            "is_active": self.is_active,
        }


class StreetName(TrackedModel):
    """Common (popular) street name -> official street name, migrated from the legacy B:C table."""

    common_name = models.CharField("الاسم الشائع للشارع", max_length=255)
    official_name = models.CharField("الاسم الرسمي للشارع", max_length=255)
    street_number = models.CharField("رقم الشارع", max_length=20, blank=True)

    class Meta:
        verbose_name = "اسم شارع"
        verbose_name_plural = "أسماء الشوارع"
        ordering = ["common_name", "id"]
        indexes = [
            GinIndex(fields=["search_text"], name="street_search_trgm", opclasses=["gin_trgm_ops"]),
        ]

    def __str__(self):
        return f"{self.common_name} (الاسم الرسمي: {self.official_name})"

    def build_search_text(self):
        return normalize_for_search(f"{self.common_name} {self.official_name} {self.street_number}")

    def snapshot(self):
        return {"common_name": self.common_name, "official_name": self.official_name,
                "street_number": self.street_number, "is_active": self.is_active}


class CommitteeRep(TrackedModel):
    """«لجان الأحياء»: a neighborhood committee's representative and how to reach them."""

    name = models.CharField("الاسم", max_length=150)
    committee = models.CharField("اسم اللجنة", max_length=200)
    phone = models.CharField("رقم الجوال", max_length=10, blank=True)

    class Meta:
        verbose_name = "ممثل لجنة حي"
        verbose_name_plural = "ممثلو لجان الأحياء"
        ordering = ["id"]
        indexes = [GinIndex(fields=["search_text"], name="committee_search_trgm", opclasses=["gin_trgm_ops"])]

    def __str__(self):
        return f"{self.name} ({self.committee})"

    def build_search_text(self):
        return normalize_for_search(f"{self.name} {self.committee} {self.phone}")

    def snapshot(self):
        return {"name": self.name, "committee": self.committee, "phone": self.phone, "is_active": self.is_active}


class Circular(TrackedModel):
    """«تعميمات»: a department instruction for answering citizens (e.g. where to send them for a topic)."""

    title = models.CharField("العنوان", max_length=200)
    body = models.TextField("نص التعميم")
    pinned = models.BooleanField("مثبّت في الأعلى", default=False)

    class Meta:
        verbose_name = "تعميم"
        verbose_name_plural = "التعميمات"
        ordering = ["-pinned", "-updated_at", "-id"]
        indexes = [GinIndex(fields=["search_text"], name="circular_search_trgm", opclasses=["gin_trgm_ops"])]

    def __str__(self):
        return self.title

    def build_search_text(self):
        return normalize_for_search(f"{self.title} {self.body}")

    def snapshot(self):
        return {"title": self.title, "body": self.body, "pinned": self.pinned, "is_active": self.is_active}
