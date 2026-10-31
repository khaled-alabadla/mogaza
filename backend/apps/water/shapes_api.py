"""
API for the water areas drawn on «الخريطة» (each tied to one row of the distribution table):

    GET    /api/water-shapes/          all of them (not paginated) + today's day index
    POST   /api/water-shapes/          {water_days: [1, 5], name: "النديم", rings: [[[lat, lng], …]],
                                        times: {"1": ["08:00", "12:00"], "5": ["12:00", "16:00"]}}
                                       the row with those days gets the name among its addresses (a new
                                       row is made when no row has them); {group: <row id>} also works;
                                       «times» (optional, per day): when the water comes that day;
                                       «supply»: its water source (خط ماكروت / a well), required for a
                                       new area; «supply_broken»: true / false sets «يوجد عطل» on that source
                                       (every area it feeds shows it)
    PATCH  /api/water-shapes/{id}/     same fields
    DELETE /api/water-shapes/{id}/

Each shape comes back with its row's days («days», «days_text») and its source («supply_info») so the
map can colour it.

    GET    /api/water-supplies/        the sources: خط ماكروت and the wells
    POST   /api/water-supplies/        {name}: a new well
    PATCH  /api/water-supplies/{id}/   {broken: true}

Read: water.view. Write: water.edit. Audited as "watershape" / "watersupply".
"""
import re

from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import WaterPermission
from apps.audit.mixins import AuditedViewSetMixin
from apps.common.validation import required_text

from .models import DAY_LABELS, DistributionGroup, WaterShape, WaterSupply, today_info
from .table_api import add_areas, row_for_days

# [south, north, west, east] around Gaza City (with a margin): every point must fall inside
GAZA_BOX = (31.42, 31.62, 34.33, 34.55)
MAX_RINGS = 10
MAX_POINTS = 1000  # per ring
BAD_RINGS = "حدود المنطقة غير صحيحة."
OUTSIDE = "المنطقة المرسومة خارج مدينة غزة."
TOO_SMALL = "ارسم ثلاث نقاط على الأقل."
CLOCK = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
BAD_TIME = "وقت وصول المياه غير صحيح."
SAME_TIME = "وقت البداية يساوي وقت النهاية."


class WaterSupplySerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = WaterSupply
        fields = ["id", "kind", "kind_display", "name", "broken"]
        read_only_fields = ["id", "kind"]
        extra_kwargs = {"name": {"error_messages": {
            "blank": "اسم البئر مطلوب.", "required": "اسم البئر مطلوب.",
            "max_length": "الاسم طويل جداً (الحد الأقصى 120 حرفاً).",
            "unique": "يوجد مصدر مياه بهذا الاسم."}}}

    def validate_name(self, value):
        return required_text(value, "اسم البئر")


def supply_info(supply):
    return WaterSupplySerializer(supply).data if supply else None


class WaterShapeSerializer(serializers.ModelSerializer):
    group = serializers.PrimaryKeyRelatedField(
        queryset=DistributionGroup.objects.all(),
        error_messages={"does_not_exist": "موعد التوزيع المحدد غير موجود.", "incorrect_type": "موعد التوزيع غير صحيح.",
                        "required": "اختر موعد المياه.", "null": "اختر موعد المياه."},
        required=False)
    water_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), source="days_in", write_only=True, required=False,
        allow_empty=False, error_messages={"empty": "اختر يوماً واحداً على الأقل."})
    supply = serializers.PrimaryKeyRelatedField(
        queryset=WaterSupply.objects.all(), required=False, allow_null=True,
        error_messages={"does_not_exist": "مصدر المياه المحدد غير موجود.", "incorrect_type": "مصدر المياه غير صحيح."})
    supply_broken = serializers.BooleanField(write_only=True, required=False)
    supply_info = serializers.SerializerMethodField()
    days = serializers.SerializerMethodField()
    days_text = serializers.SerializerMethodField()
    day_labels = serializers.SerializerMethodField()

    class Meta:
        model = WaterShape
        fields = ["id", "group", "name", "rings", "times", "supply", "supply_broken", "supply_info", "water_days",
                  "days", "days_text", "day_labels", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        extra_kwargs = {"name": {"error_messages": {"blank": "اسم المنطقة مطلوب.", "required": "اسم المنطقة مطلوب.",
                                                    "max_length": "الاسم طويل جداً (الحد الأقصى 200 حرف)."}}}

    def get_supply_info(self, obj):
        return supply_info(obj.supply)

    def get_days(self, obj):
        return sorted(obj.group.days)

    def get_days_text(self, obj):
        return obj.group.days_text

    def get_day_labels(self, obj):
        return [DAY_LABELS[d] for d in sorted(obj.group.days)]

    def validate_name(self, value):
        return required_text(value, "اسم المنطقة")

    def validate_times(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(BAD_TIME)
        times = {}
        for day, window in value.items():
            if str(day) not in {str(d) for d in range(7)} or not isinstance(window, (list, tuple)) or len(window) != 2:
                raise serializers.ValidationError(BAD_TIME)
            start, end = (str(t or "").strip()[:5] for t in window)
            if not start and not end:
                continue  # no time for that day
            if not (CLOCK.match(start) and CLOCK.match(end)):
                raise serializers.ValidationError(BAD_TIME)
            if start == end:
                raise serializers.ValidationError(SAME_TIME)
            times[str(day)] = [start, end]
        return times

    def validate(self, attrs):
        if self.instance is None and "group" not in attrs and "days_in" not in attrs:
            raise serializers.ValidationError({"water_days": ["اختر أيام وصول المياه."]})
        if self.instance is None and not attrs.get("supply"):
            raise serializers.ValidationError({"supply": ["اختر مصدر المياه."]})
        if "supply" in attrs and attrs["supply"] is None and self.instance is not None and self.instance.supply_id:
            raise serializers.ValidationError({"supply": ["اختر مصدر المياه."]})
        # only the area's own days keep a time
        if "days_in" in attrs:
            days = set(attrs["days_in"])
        elif "group" in attrs:
            days = set(attrs["group"].days)
        else:
            days = set(self.instance.group.days) if self.instance else set()
        times = attrs.get("times", self.instance.times if self.instance else None)
        if times is not None:
            attrs["times"] = {d: w for d, w in times.items() if int(d) in days}
        return attrs

    def _with_row(self, validated_data, name):
        """«water_days» → the table's row with those days (made when missing), listing the area's name."""
        broken = validated_data.pop("supply_broken", None)
        supply = validated_data.get("supply", getattr(self.instance, "supply", None))
        if broken is not None and supply is not None and supply.broken != broken:
            supply.broken = broken
            supply.save(update_fields=["broken", "updated_at"])
        days = validated_data.pop("days_in", None)
        if days is None:
            return validated_data
        days = sorted(set(days))
        row = row_for_days(days)
        if row is None:
            last = DistributionGroup.objects.order_by("-sort_order").values_list("sort_order", flat=True).first()
            row = DistributionGroup.objects.create(days=days, sort_order=(last or 0) + 1)
        source = {"mekorot": "mekorot", "well": "wells"}.get(supply.kind, "") if supply else ""
        add_areas(row, [{"name": name, "source": source}])
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
        return WaterShape.objects.select_related("group", "supply")

    def save_kwargs(self, created):
        user = self.request.user
        return {"created_by": user, "updated_by": user} if created else {"updated_by": user}

    def list(self, request, *args, **kwargs):
        rows = self.get_serializer(self.get_queryset(), many=True).data
        return Response({**today_info(), "results": rows})


class WaterSupplyViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """خط ماكروت and the local wells; editors add wells and mark a fault. Not deleted (areas use them)."""

    serializer_class = WaterSupplySerializer
    permission_classes = [WaterPermission]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]
    audit_entity_type = "watersupply"
    queryset = WaterSupply.objects.all()

    def save_kwargs(self, created):
        return {"created_by": self.request.user} if created else {}
