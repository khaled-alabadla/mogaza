"""
API for the official water distribution table («جدول توزيع المياه حسب توجيهات المواطنين»):

    GET    /api/water-table/            all rows (not paginated, small table) + today's day index
    POST   /api/water-table/            {days: [0, 3], note?, areas: [{"name": "النديم", "source": "mekorot"}, …]}
                                        when a row with the same days exists, the areas are added to it
                                        (200, "merged": true, "added": n) instead of making a second row
    PATCH  /api/water-table/{id}/       same fields; `areas`, when sent, replaces the row's list

Each area has a water source: "mekorot" (خط ماكروت), "wells" (الآبار المحلية) or "" (غير مصنّف).
An area may also be sent as a plain string (= unclassified).
    DELETE /api/water-table/{id}/

Read: water.view (or anyone when PUBLIC_SEARCH_ENABLED). Write: water.edit.
"""
from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import WaterPermission
from apps.audit.mixins import AuditedViewSetMixin
from apps.audit.models import AuditLog
from apps.locations.text import clean_text

from .models import DAY_LABELS, DistributionArea, DistributionGroup, WaterSource, today_info

BAD_DAY = "يوم غير صحيح."
DAYS_REQUIRED = "اختر يوماً واحداً على الأقل."
AREAS_REQUIRED = "أدخل عنواناً واحداً على الأقل."
AREA_TOO_LONG = "العنوان طويل جداً (الحد الأقصى 200 حرف)."
BAD_SOURCE = "مصدر المياه غير صحيح."


class AreaField(serializers.Field):
    """An area to write: {"name", "source"} or a plain name (unclassified). Returns a cleaned dict."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = {"name": data}
        if not isinstance(data, dict):
            raise serializers.ValidationError(AREAS_REQUIRED)
        name = clean_text(data.get("name"))
        if len(name) > 200:
            raise serializers.ValidationError(AREA_TOO_LONG)
        source = data.get("source") or WaterSource.UNCLASSIFIED
        if source not in WaterSource.values:
            raise serializers.ValidationError(BAD_SOURCE)
        return {"name": name, "source": source}


class DistributionGroupSerializer(serializers.ModelSerializer):
    days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6,
                                       error_messages={"min_value": BAD_DAY, "max_value": BAD_DAY, "invalid": BAD_DAY}),
        allow_empty=False, error_messages={"empty": DAYS_REQUIRED, "required": DAYS_REQUIRED})
    areas = serializers.ListField(child=AreaField(), required=False, write_only=True)
    area_list = serializers.SerializerMethodField()
    days_text = serializers.CharField(read_only=True)
    day_labels = serializers.SerializerMethodField()

    class Meta:
        model = DistributionGroup
        fields = ["id", "days", "days_text", "day_labels", "note", "sort_order", "areas", "area_list", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        extra_kwargs = {"note": {"required": False, "allow_blank": True},
                        "sort_order": {"required": False}}

    def get_area_list(self, obj):
        return [{"id": a.id, "name": a.name, "source": a.source, "source_display": a.get_source_display()}
                for a in obj.areas.all()]

    def get_day_labels(self, obj):
        return [DAY_LABELS[d] for d in sorted(obj.days)]

    def validate_days(self, value):
        return sorted(set(value))

    def validate_note(self, value):
        return clean_text(value)

    def validate_areas(self, value):
        # drop blanks; the same name twice keeps its first entry (and source)
        areas, seen = [], set()
        for area in value:
            if area["name"] and area["name"] not in seen:
                seen.add(area["name"])
                areas.append(area)
        if not areas:
            raise serializers.ValidationError(AREAS_REQUIRED)
        return areas

    def validate(self, attrs):
        if self.instance is None and "areas" not in attrs:
            raise serializers.ValidationError({"areas": [AREAS_REQUIRED]})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        areas = validated_data.pop("areas")
        if "sort_order" not in validated_data:
            last = DistributionGroup.objects.order_by("-sort_order").values_list("sort_order", flat=True).first()
            validated_data["sort_order"] = (last or 0) + 1
        group = DistributionGroup.objects.create(**validated_data)
        self._set_areas(group, areas)
        return group

    @transaction.atomic
    def update(self, instance, validated_data):
        areas = validated_data.pop("areas", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if areas is not None:
            instance.areas.all().delete()
            self._set_areas(instance, areas)
            getattr(instance, "_prefetched_objects_cache", {}).pop("areas", None)  # don't serve the old list
        return instance

    @staticmethod
    def _set_areas(group, areas):
        DistributionArea.objects.bulk_create(
            [DistributionArea(group=group, sort_order=i, **area) for i, area in enumerate(areas)])


def row_for_days(days):
    """The table's row with exactly these days, or None."""
    days = sorted(set(days))
    return next((g for g in DistributionGroup.objects.prefetch_related("areas") if sorted(g.days) == days), None)


def add_areas(group, areas):
    """Appends the areas the row doesn't list yet (by name); returns how many were added."""
    have = {a.name for a in group.areas.all()}
    new = [a for a in areas if a["name"] not in have]
    start = max((a.sort_order for a in group.areas.all()), default=-1) + 1
    DistributionArea.objects.bulk_create(
        [DistributionArea(group=group, sort_order=start + i, **area) for i, area in enumerate(new)])
    if new:
        group.save(update_fields=["updated_at"])
    getattr(group, "_prefetched_objects_cache", {}).pop("areas", None)
    return len(new)


class DistributionGroupViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """Rows of the official distribution table (see the module docstring). Audited as "watertable"."""

    serializer_class = DistributionGroupSerializer
    permission_classes = [WaterPermission]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    audit_entity_type = "watertable"

    def get_queryset(self):
        return DistributionGroup.objects.prefetch_related("areas")

    def list(self, request, *args, **kwargs):
        rows = self.get_serializer(self.get_queryset(), many=True).data
        return Response({**today_info(), "results": rows})

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """A new schedule: added to the row with the same days when there is one, else a new row."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = row_for_days(serializer.validated_data["days"])
        if row is None:
            self.perform_create(serializer)
            return Response({**serializer.data, "merged": False, "added": len(serializer.validated_data["areas"])},
                            status=status.HTTP_201_CREATED)
        before = row.snapshot()
        added = add_areas(row, serializer.validated_data["areas"])
        if added:
            self.audit(AuditLog.Action.UPDATE, row, before=before, after=row.snapshot())
        return Response({**self.get_serializer(row).data, "merged": True, "added": added})
