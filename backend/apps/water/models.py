from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

# Local week order (the week starts on Saturday in Gaza): 0=السبت ... 6=الجمعة.
DAY_LABELS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]
DAY_CHOICES = list(enumerate(DAY_LABELS))

TIME_FORMAT = "%H:%M"


def local_day_index(date):
    """Python weekday (Mon=0) -> local week index (Sat=0)."""
    return (date.weekday() + 2) % 7


def today_info():
    """{"today": local day index, "today_display": its label} for the API (TIME_ZONE = Asia/Gaza)."""
    today = local_day_index(timezone.localdate())
    return {"today": today, "today_display": DAY_LABELS[today]}


def slot_days(slots):
    """Sorted distinct days of the given slots."""
    return sorted({slot.day for slot in slots})


def schedule_text(slots):
    """
    Human-readable schedule: days sharing the same window are grouped, e.g.
    "الاثنين، الجمعة 09:00–12:00 · السبت 22:00–02:00". Groups are ordered by their first day
    (then start time); days are in week order.
    """
    windows = {}
    for slot in slots:
        windows.setdefault((slot.start_time, slot.end_time), set()).add(slot.day)
    groups = sorted(windows.items(), key=lambda item: (min(item[1]), item[0]))
    return " · ".join(
        f"{'، '.join(DAY_LABELS[d] for d in sorted(days))} {start:%H:%M}–{end:%H:%M}"
        for (start, end), days in groups
    )


class Neighborhood(models.Model):
    """A city neighborhood (الحي) as used by gaza-city.org."""

    name = models.CharField("اسم الحي", max_length=120, unique=True)
    sort_order = models.IntegerField("الترتيب", default=0)
    created_at = models.DateTimeField("تاريخ الإضافة", auto_now_add=True)
    updated_at = models.DateTimeField("آخر تعديل", auto_now=True)

    class Meta:
        verbose_name = "حي"
        verbose_name_plural = "الأحياء"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def snapshot(self):
        return {"name": self.name, "sort_order": self.sort_order}


class WaterZone(models.Model):
    """A water-supply zone inside a neighborhood: all its buildings share one weekly schedule."""

    neighborhood = models.ForeignKey(Neighborhood, on_delete=models.PROTECT, related_name="zones",
                                     verbose_name="الحي")
    name = models.CharField("اسم المنطقة", max_length=120)
    code = models.CharField("الرمز", max_length=10, blank=True)
    note = models.CharField("ملاحظة", max_length=300, blank=True)
    sort_order = models.IntegerField("الترتيب", default=0)
    created_at = models.DateTimeField("تاريخ الإضافة", auto_now_add=True)
    updated_at = models.DateTimeField("آخر تعديل", auto_now=True)

    class Meta:
        verbose_name = "منطقة مياه"
        verbose_name_plural = "مناطق المياه"
        ordering = ["neighborhood__sort_order", "neighborhood__name", "sort_order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["neighborhood", "name"], name="waterzone_unique_name_per_neighborhood"),
        ]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        return f"{self.neighborhood.name} — {self.name}"

    def snapshot(self, location_ids=None):
        data = {
            "name": self.name, "code": self.code, "note": self.note, "sort_order": self.sort_order,
            "neighborhood": self.neighborhood_id, "neighborhood_name": self.neighborhood.name,
            "slots": [slot.snapshot() for slot in self.slots.all()] if self.pk else [],
        }
        if location_ids is not None:
            data["location_ids"] = sorted(location_ids)
        return data


class WaterSlot(models.Model):
    """One water-supply window of a zone on a given day of the week."""

    class Source(models.TextChoices):
        MANUAL = "manual", "إدخال يدوي"
        GAZA_CITY = "gaza-city.org", "gaza-city.org"

    zone = models.ForeignKey(WaterZone, on_delete=models.CASCADE, related_name="slots", verbose_name="المنطقة")
    day = models.PositiveSmallIntegerField("اليوم", choices=DAY_CHOICES, db_index=True)
    start_time = models.TimeField("من")
    # May be earlier than start_time: an overnight window such as 22:00 - 02:00.
    end_time = models.TimeField("إلى")
    note = models.CharField("ملاحظة", max_length=200, blank=True)
    source = models.CharField("المصدر", max_length=30, choices=Source.choices, default=Source.MANUAL)
    created_at = models.DateTimeField("تاريخ الإضافة", auto_now_add=True)
    updated_at = models.DateTimeField("آخر تعديل", auto_now=True)

    class Meta:
        verbose_name = "موعد مياه"
        verbose_name_plural = "جدول المياه"
        ordering = ["day", "start_time"]
        constraints = [
            models.CheckConstraint(condition=Q(day__gte=0, day__lte=6), name="waterslot_day_range"),
            models.CheckConstraint(condition=~Q(start_time=F("end_time")), name="waterslot_start_ne_end"),
            models.UniqueConstraint(fields=["zone", "day", "start_time", "end_time"], name="waterslot_unique_window"),
        ]

    def __str__(self):
        return f"{DAY_LABELS[self.day]} {self.start_time:%H:%M}-{self.end_time:%H:%M}"

    def snapshot(self):
        return {"day": self.day, "start_time": self.start_time.strftime(TIME_FORMAT),
                "end_time": self.end_time.strftime(TIME_FORMAT), "note": self.note}


class DistributionGroup(models.Model):
    """
    One row of the official «جدول توزيع المياه»: a pair (or set) of days and the list of
    addresses that receive water on those days, e.g. «السبت / الثلاثاء» → «النديم / عين جالوت / …».
    """

    days = ArrayField(models.PositiveSmallIntegerField(choices=DAY_CHOICES), verbose_name="الأيام")
    note = models.CharField("ملاحظة", max_length=300, blank=True)
    sort_order = models.IntegerField("الترتيب", default=0)
    created_at = models.DateTimeField("تاريخ الإضافة", auto_now_add=True)
    updated_at = models.DateTimeField("آخر تعديل", auto_now=True)

    class Meta:
        verbose_name = "موعد توزيع"
        verbose_name_plural = "جدول توزيع المياه"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.days_text

    @property
    def days_text(self):
        return " / ".join(DAY_LABELS[d] for d in sorted(self.days))

    def snapshot(self):
        return {"days": sorted(self.days), "note": self.note,
                "areas": [a.name for a in self.areas.all()]}


class DistributionArea(models.Model):
    """An address / area inside a distribution row («النديم», «مفترق التايلاندي وبالميرا», …)."""

    group = models.ForeignKey(DistributionGroup, on_delete=models.CASCADE, related_name="areas",
                              verbose_name="الموعد")
    name = models.CharField("العنوان", max_length=200)
    sort_order = models.IntegerField("الترتيب", default=0)

    class Meta:
        verbose_name = "عنوان"
        verbose_name_plural = "العناوين"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name
