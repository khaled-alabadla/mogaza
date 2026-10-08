from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from apps.common.validation import exclude_instance, required_text
from apps.locations.models import Location
from apps.locations.text import clean_text, name_key

from .models import DAY_LABELS, TIME_FORMAT, Neighborhood, WaterSlot, WaterZone, schedule_text, slot_days
from .zoning import default_zone_name, next_free_code

TIME_ERRORS = {"invalid": "صيغة الوقت غير صحيحة (المطلوب HH:MM).", "required": "الوقت مطلوب.",
               "null": "الوقت مطلوب."}
NEIGHBORHOOD_ERRORS = {"does_not_exist": "الحي المحدد غير موجود.", "incorrect_type": "قيمة الحي غير صالحة."}
SORT_ORDER_ERRORS = {"invalid": "الترتيب يجب أن يكون رقماً صحيحاً."}


def slot_data(slot):
    """
    Read representation of one slot: {id, day, day_display, start_time, end_time, note} with "HH:MM"
    times. A plain function (not a ModelSerializer) because it runs for every row of the location
    and zone lists.
    """
    return {"id": slot.id, "day": slot.day, "day_display": DAY_LABELS[slot.day],
            "start_time": slot.start_time.strftime(TIME_FORMAT), "end_time": slot.end_time.strftime(TIME_FORMAT),
            "note": slot.note}


class NeighborhoodSerializer(serializers.ModelSerializer):
    locations_count = serializers.IntegerField(read_only=True, default=0)
    scheduled_count = serializers.IntegerField(read_only=True, default=0)
    zones_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Neighborhood
        fields = ["id", "name", "sort_order", "locations_count", "scheduled_count", "zones_count"]
        read_only_fields = ["id"]
        extra_kwargs = {
            # Uniqueness is checked in validate_name on the Arabic-normalized form.
            "name": {"validators": [],
                     "error_messages": {"blank": "اسم الحي مطلوب.", "required": "اسم الحي مطلوب.",
                                        "max_length": "اسم الحي طويل جداً (الحد الأقصى 120 حرفاً)."}},
            "sort_order": {"required": False, "error_messages": SORT_ORDER_ERRORS},
        }

    def validate_name(self, value):
        value = required_text(value, "اسم الحي")
        key = name_key(value)
        others = exclude_instance(Neighborhood.objects.all(), self.instance)
        if any(name_key(name) == key for name in others.values_list("name", flat=True)):
            raise serializers.ValidationError("هذا الحي موجود مسبقاً.")
        return value


class WaterSlotInputSerializer(serializers.Serializer):
    day = serializers.IntegerField(min_value=0, max_value=6, error_messages={
        "required": "اليوم مطلوب.", "null": "اليوم مطلوب.", "invalid": "اليوم غير صالح.",
        "min_value": "اليوم يجب أن يكون بين 0 (السبت) و 6 (الجمعة).",
        "max_value": "اليوم يجب أن يكون بين 0 (السبت) و 6 (الجمعة).",
    })
    start_time = serializers.TimeField(input_formats=["%H:%M", "%H:%M:%S"], error_messages=TIME_ERRORS)
    end_time = serializers.TimeField(input_formats=["%H:%M", "%H:%M:%S"], error_messages=TIME_ERRORS)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="",
                                 error_messages={"max_length": "الملاحظة طويلة جداً (الحد الأقصى 200 حرف)."})

    def validate_note(self, value):
        return clean_text(value)

    def validate(self, attrs):
        # Seconds are not part of the schedule; an overnight window (end < start) is allowed.
        attrs["start_time"] = attrs["start_time"].replace(second=0, microsecond=0)
        attrs["end_time"] = attrs["end_time"].replace(second=0, microsecond=0)
        if attrs["start_time"] == attrs["end_time"]:
            raise serializers.ValidationError({"end_time": "وقت النهاية يجب أن يختلف عن وقت البداية."})
        return attrs


class ZoneLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "place_name", "description", "building_number", "street_number"]
        read_only_fields = fields


class WaterZoneSerializer(serializers.ModelSerializer):
    """
    A zone with its slots. On write, `slots` (when present) replaces all slots atomically;
    `code` is auto-assigned on create and `name` defaults to «منطقة <code>».
    """

    neighborhood = serializers.PrimaryKeyRelatedField(
        queryset=Neighborhood.objects.all(),
        error_messages={"required": "الحي مطلوب.", "null": "الحي مطلوب.", **NEIGHBORHOOD_ERRORS})
    name = serializers.CharField(max_length=120, required=False, allow_blank=True,
                                 error_messages={"max_length": "اسم المنطقة طويل جداً (الحد الأقصى 120 حرفاً)."})
    code = serializers.CharField(max_length=10, required=False, allow_blank=True,
                                 error_messages={"max_length": "رمز المنطقة طويل جداً (الحد الأقصى 10 أحرف)."})
    note = serializers.CharField(max_length=300, required=False, allow_blank=True,
                                 error_messages={"max_length": "الملاحظة طويلة جداً (الحد الأقصى 300 حرف)."})
    slots = WaterSlotInputSerializer(many=True, required=False, allow_empty=True, write_only=True,
                                     error_messages={"not_a_list": "قائمة المواعيد غير صالحة."})
    neighborhood_name = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    schedule_text = serializers.SerializerMethodField()
    days = serializers.SerializerMethodField()
    locations_count = serializers.SerializerMethodField()

    class Meta:
        model = WaterZone
        fields = ["id", "name", "code", "note", "sort_order", "neighborhood", "neighborhood_name", "display_name",
                  "slots", "schedule_text", "days", "locations_count"]
        read_only_fields = ["id"]
        # The model field supplies the database integer range (an out-of-range value is a 400, not a 500).
        extra_kwargs = {"sort_order": {"required": False, "error_messages": SORT_ORDER_ERRORS}}
        validators = []  # (neighborhood, name) uniqueness is checked in validate() on the normalized name

    # --- read -------------------------------------------------------------------------
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["slots"] = [slot_data(slot) for slot in instance.slots.all()]
        # keep the documented key order: slots before schedule_text
        ordered = {}
        for key in self.Meta.fields:
            if key in data:
                ordered[key] = data[key]
        ordered.update({k: v for k, v in data.items() if k not in ordered})
        return ordered

    def get_neighborhood_name(self, obj):
        return obj.neighborhood.name

    def get_display_name(self, obj):
        return obj.display_name

    def get_schedule_text(self, obj):
        return schedule_text(obj.slots.all())

    def get_days(self, obj):
        return slot_days(obj.slots.all())

    def get_locations_count(self, obj):
        count = getattr(obj, "locations_count", None)
        return count if count is not None else obj.locations.filter(is_active=True).count()

    # --- write ------------------------------------------------------------------------
    def validate_note(self, value):
        return clean_text(value)

    def validate_code(self, value):
        return clean_text(value).upper()

    def validate_slots(self, value):
        windows = [(s["day"], s["start_time"], s["end_time"]) for s in value]
        if len(windows) != len(set(windows)):
            raise serializers.ValidationError("لا يمكن تكرار نفس الموعد (اليوم والوقت) أكثر من مرة.")
        return value

    def validate(self, attrs):
        instance = self.instance
        neighborhood = attrs.get("neighborhood", instance.neighborhood if instance else None)
        siblings = exclude_instance(WaterZone.objects.filter(neighborhood=neighborhood), instance)
        sibling_rows = list(siblings.values_list("name", "code"))
        sibling_keys = {name_key(name) for name, _ in sibling_rows}

        code = attrs.get("code", instance.code if instance else "")
        if not code and instance is None:
            code = next_free_code([c for _, c in sibling_rows], sibling_keys, key=name_key)
            attrs["code"] = code

        if "name" in attrs or instance is None:
            name = clean_text(attrs.get("name", ""))
            if not name:
                if not code:
                    raise serializers.ValidationError({"name": ["اسم المنطقة مطلوب."]})
                name = default_zone_name(code)
            attrs["name"] = name
        name = attrs.get("name", instance.name if instance else "")
        if name_key(name) in sibling_keys:
            raise serializers.ValidationError({"name": ["يوجد منطقة بهذا الاسم في نفس الحي."]})

        if instance is None and "sort_order" not in attrs:
            top = WaterZone.objects.filter(neighborhood=neighborhood).aggregate(m=Max("sort_order"))["m"] or 0
            attrs["sort_order"] = top + 1
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        slots = validated_data.pop("slots", None)
        zone = WaterZone.objects.create(**validated_data)
        if slots:
            self._replace_slots(zone, slots)
        return zone

    @transaction.atomic
    def update(self, instance, validated_data):
        slots = validated_data.pop("slots", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if slots is not None:
            self._replace_slots(instance, slots)
        return instance

    @staticmethod
    def _replace_slots(zone, slots):
        zone.slots.all().delete()
        WaterSlot.objects.bulk_create([WaterSlot(zone=zone, source=WaterSlot.Source.MANUAL, **slot) for slot in slots])


class WaterZoneDetailSerializer(WaterZoneSerializer):
    """Zone item plus its active buildings (ordered by place_name)."""

    locations = serializers.SerializerMethodField()

    class Meta(WaterZoneSerializer.Meta):
        fields = WaterZoneSerializer.Meta.fields + ["locations"]

    def get_locations(self, obj):
        locations = getattr(obj, "active_locations", None)
        if locations is None:
            locations = obj.locations.filter(is_active=True).order_by("place_name", "id")
        return ZoneLocationSerializer(locations, many=True).data


class LocationIdsSerializer(serializers.Serializer):
    location_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1, error_messages={"invalid": "رقم الموقع غير صالح.",
                                                                    "min_value": "رقم الموقع غير صالح."}),
        allow_empty=False,
        error_messages={"required": "يجب تحديد المواقع.", "empty": "يجب تحديد موقع واحد على الأقل.",
                        "not_a_list": "قائمة المواقع غير صالحة."})
