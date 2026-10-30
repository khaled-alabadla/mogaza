"""
API for the water areas drawn on «الخريطة» (each tied to one row of the distribution table):

    GET    /api/water-shapes/          all of them (not paginated) + today's day index
    POST   /api/water-shapes/          {days: [1, 5], name: "النديم", rings: [[[lat, lng], …]]}
                                       the row with those days gets the name among its addresses (a new
                                       row is made when no row has them); {group: <row id>} also works
    PATCH  /api/water-shapes/{id}/     same fields
    DELETE /api/water-shapes/{id}/

Each shape comes back with its row's days («days», «days_text») so the map can colour it.
Read: water.view. Write: water.edit. Audited as "watershape".
"""
from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import WaterPermission
from apps.audit.mixins import AuditedViewSetMixin
from apps.common.validation import required_text

from .models import DAY_LABELS, DistributionGroup, WaterShape, today_info
from .table_api import add_areas, row_for_days

# [south, north, west, east] around Gaza City (with a margin): every point must fall inside
GAZA_BOX = (31.42, 31.62, 34.33, 34.55)
MAX_RINGS = 10
MAX_POINTS = 1000  # per ring
BAD_RINGS = "حدود المنطقة غير صحيحة."
OUTSIDE = "المنطقة المرسومة خارج مدينة غزة."
TOO_SMALL = "ارسم ثلاث نقاط على الأقل."


class WaterShapeSerializer(serializers.ModelSerializer):
    group = serializers.PrimaryKeyRelatedField(
        queryset=DistributionGroup.objects.all(),
        error_messages={"does_not_exist": "موعد التوزيع المحدد غير موجود.", "incorrect_type": "موعد التوزيع غير صحيح.",
                        "required": "اختر موعد المياه.", "null": "اختر موعد المياه."},
        required=False)
    water_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), source="days_in", write_only=True, required=False,
        allow_empty=False, error_messages={"empty": "اختر يوماً واحداً على الأقل."})
    days = serializers.SerializerMethodField()
    days_text = serializers.SerializerMethodField()
    day_labels = serializers.SerializerMethodField()

    class Meta:
        model = WaterShape
        fields = ["id", "group", "name", "rings", "water_days", "days", "days_text", "day_labels", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        extra_kwargs = {"name": {"error_messages": {"blank": "اسم المنطقة مطلوب.", "required": "اسم المنطقة مطلوب.",
                                                    "max_length": "الاسم طويل جداً (الحد الأقصى 200 حرف)."}}}

    def get_days(self, obj):
        return sorted(obj.group.days)

    def get_days_text(self, obj):
        return obj.group.days_text

    def get_day_labels(self, obj):
        return [DAY_LABELS[d] for d in sorted(obj.group.days)]

    def validate_name(self, value):
        return required_text(value, "اسم المنطقة")

    def validate(self, attrs):
        if self.instance is None and "group" not in attrs and "days_in" not in attrs:
            raise serializers.ValidationError({"water_days": ["اختر أيام وصول المياه."]})
        return attrs

    def _with_row(self, validated_data, name):
        """«water_days» → the table's row with those days (made when missing), listing the area's name."""
        days = validated_data.pop("days_in", None)
        if days is None:
            return validated_data
        days = sorted(set(days))
        row = row_for_days(days)
        if row is None:
            last = DistributionGroup.objects.order_by("-sort_order").values_list("sort_order", flat=True).first()
            row = DistributionGroup.objects.create(days=days, sort_order=(last or 0) + 1)
        add_areas(row, [{"name": name, "source": ""}])
        validated_data["group"] = row
        return validated_data

    @transaction.atomic
    def create(self, validated_data):
        return super().create(self._with_row(validated_data, validated_data["name"]))

    @transaction.atomic
    def update(self, instance, validated_data):
        return super().update(instance, self._with_row(validated_data, validated_data.get("name", instance.name)))

    def validate_rings(self, value):
        if not isinstance(value, list) or not 1 <= len(value) <= MAX_RINGS:
            raise serializers.ValidationError(BAD_RINGS)
        rings = []
        for ring in value:
            if not isinstance(ring, list) or len(ring) > MAX_POINTS:
                raise serializers.ValidationError(BAD_RINGS)
            points = []
            for point in ring:
                try:
                    lat, lng = (round(float(n), 6) for n in point)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(BAD_RINGS) from None
                if not (GAZA_BOX[0] <= lat <= GAZA_BOX[1] and GAZA_BOX[2] <= lng <= GAZA_BOX[3]):
                    raise serializers.ValidationError(OUTSIDE)
                points.append([lat, lng])
            if len(points) > 1 and points[0] == points[-1]:
                points.pop()  # closed by the map itself
            if len({tuple(p) for p in points}) < 3:
                raise serializers.ValidationError(TOO_SMALL)
            rings.append(points)
        return rings


class WaterShapeViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = WaterShapeSerializer
    permission_classes = [WaterPermission]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    audit_entity_type = "watershape"

    def get_queryset(self):
        return WaterShape.objects.select_related("group")

    def save_kwargs(self, created):
        user = self.request.user
        return {"created_by": user, "updated_by": user} if created else {"updated_by": user}

    def list(self, request, *args, **kwargs):
        rows = self.get_serializer(self.get_queryset(), many=True).data
        return Response({**today_info(), "results": rows})
