import re

from rest_framework import serializers

from apps.common.validation import code_text, required_text
from apps.water.models import Neighborhood, WaterZone, schedule_text
from apps.water.serializers import NEIGHBORHOOD_ERRORS, slot_data

from .models import Circular, CommitteeRep, Location, StreetName
from .text import ascii_digits, clean_text


def user_label(user):
    if not user:
        return None
    return user.get_full_name() or user.get_username()


def visible_user_label(user, viewer):
    """
    user_label, except that the superuser (the hidden developer account) is never named to anyone
    but a superuser: None then.
    """
    if not user or (user.is_superuser and not getattr(viewer, "is_superuser", False)):
        return None
    return user_label(user)


class TrackedSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    def viewer(self):
        request = self.context.get("request")
        return request.user if request else None

    def get_created_by_name(self, obj):
        return visible_user_label(obj.created_by, self.viewer())

    def get_updated_by_name(self, obj):
        return visible_user_label(obj.updated_by, self.viewer())

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        # Anonymous visitors (public search) do not see who edited the record.
        if not (request and request.user.is_authenticated):
            for key in ("created_by_name", "updated_by_name", "created_at", "updated_at"):
                data.pop(key, None)
        return data


# filled in for every new location (the place name is always required)
REQUIRED_ON_ADD = {"description": "الوصف / الموقع", "building_number": "رقم المبنى", "street_number": "رقم الشارع",
                   "neighborhood": "الحي"}

# [south, north, west, east] around Gaza City (with a margin): a map point must fall inside
GAZA_BOX = (31.42, 31.62, 34.33, 34.55)


class LocationSerializer(TrackedSerializer):
    neighborhood = serializers.PrimaryKeyRelatedField(
        queryset=Neighborhood.objects.all(), required=False, allow_null=True, error_messages=NEIGHBORHOOD_ERRORS)
    neighborhood_name = serializers.SerializerMethodField()
    water_zone = serializers.PrimaryKeyRelatedField(
        # slots prefetched with the zone: the response's two schedule fields share one query
        queryset=WaterZone.objects.select_related("neighborhood").prefetch_related("slots"), required=False,
        allow_null=True,
        error_messages={"does_not_exist": "منطقة المياه المحددة غير موجودة.",
                        "incorrect_type": "قيمة منطقة المياه غير صالحة."})
    water_zone_name = serializers.SerializerMethodField()
    # The building's schedule is its zone's schedule (edited via /api/water-zones/).
    water_schedule = serializers.SerializerMethodField()
    water_schedule_text = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ["id", "place_name", "description", "building_number", "street_number", "neighborhood",
                  "neighborhood_name", "water_zone", "water_zone_name", "water_schedule", "water_schedule_text", "is_active",
                  "latitude", "longitude", "created_at", "updated_at", "created_by_name", "updated_by_name"]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "place_name": {"error_messages": {"blank": "اسم المكان مطلوب.", "required": "اسم المكان مطلوب.",
                                              "max_length": "اسم المكان طويل جداً (الحد الأقصى 255 حرفاً)."}},
            "description": {"required": False, "allow_blank": True,
                            "error_messages": {"max_length": "الوصف طويل جداً (الحد الأقصى 500 حرف)."}},
            "building_number": {"required": False, "allow_blank": True,
                                "error_messages": {"max_length": "رقم المبنى طويل جداً (الحد الأقصى 20 حرفاً)."}},
            "street_number": {"required": False, "allow_blank": True,
                              "error_messages": {"max_length": "رقم الشارع طويل جداً (الحد الأقصى 20 حرفاً)."}},
            # set by «إضافة نقطة» on «الخريطة» (the search page's form leaves them as they are)
            "latitude": {"required": False, "allow_null": True},
            "longitude": {"required": False, "allow_null": True},
        }

    def get_neighborhood_name(self, obj):
        return obj.neighborhood.name if obj.neighborhood_id else None

    def get_water_zone_name(self, obj):
        return obj.water_zone.display_name if obj.water_zone_id else None

    def get_water_schedule(self, obj):
        return [slot_data(slot) for slot in obj.water_zone.slots.all()] if obj.water_zone_id else []

    def get_water_schedule_text(self, obj):
        return schedule_text(obj.water_zone.slots.all()) if obj.water_zone_id else ""

    def validate(self, attrs):
        """Keep the building's neighborhood equal to its zone's neighborhood; a point is in Gaza City."""
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if ("latitude" in attrs) != ("longitude" in attrs) or (lat is None) != (lng is None):
            raise serializers.ValidationError({"latitude": "يجب تحديد خط العرض وخط الطول معاً."})
        if lat is not None and not (GAZA_BOX[0] <= lat <= GAZA_BOX[1] and GAZA_BOX[2] <= lng <= GAZA_BOX[3]):
            raise serializers.ValidationError({"latitude": "النقطة خارج مدينة غزة."})
        zone = attrs.get("water_zone")
        if zone is not None:
            attrs["neighborhood"] = zone.neighborhood
        elif "neighborhood" in attrs and "water_zone" not in attrs and self.instance is not None:
            current = self.instance.water_zone
            if current is not None and current.neighborhood_id != getattr(attrs["neighborhood"], "pk", None):
                attrs["water_zone"] = None  # moved to another neighborhood: the old zone no longer applies
        if self.instance is None:
            # a new location needs every field (older ones may still have blanks: editing them is unchanged)
            missing = {name: f"{label} مطلوب." for name, label in REQUIRED_ON_ADD.items() if not attrs.get(name)}
            if missing:
                raise serializers.ValidationError(missing)
        return attrs

    def validate_place_name(self, value):
        return required_text(value, "اسم المكان")

    def validate_description(self, value):
        return clean_text(value)

    def validate_building_number(self, value):
        return code_text(value, "رقم المبنى")

    def validate_street_number(self, value):
        return code_text(value, "رقم الشارع")


class StreetNameSerializer(TrackedSerializer):
    class Meta:
        model = StreetName
        fields = ["id", "common_name", "official_name", "street_number", "is_active", "created_at", "updated_at",
                  "created_by_name", "updated_by_name"]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "common_name": {"error_messages": {"blank": "الاسم الشائع مطلوب.", "required": "الاسم الشائع مطلوب."}},
            "official_name": {"error_messages": {"blank": "الاسم الرسمي مطلوب.", "required": "الاسم الرسمي مطلوب."}},
            "street_number": {"required": False, "allow_blank": True,
                              "error_messages": {"max_length": "رقم الشارع طويل جداً (الحد الأقصى 20 حرفاً)."}},
        }

    def validate_common_name(self, value):
        return required_text(value, "الاسم الشائع")

    def validate_official_name(self, value):
        return required_text(value, "الاسم الرسمي")

    def validate_street_number(self, value):
        return code_text(value, "رقم الشارع")


class CommitteeRepSerializer(TrackedSerializer):
    class Meta:
        model = CommitteeRep
        fields = ["id", "name", "committee", "phone", "is_active", "created_at", "updated_at", "created_by_name",
                  "updated_by_name"]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"error_messages": {"blank": "الاسم مطلوب.", "required": "الاسم مطلوب."}},
            "committee": {"error_messages": {"blank": "اسم اللجنة مطلوب.", "required": "اسم اللجنة مطلوب."}},
            "phone": {"required": False, "allow_blank": True, "max_length": None},
        }

    def validate_name(self, value):
        return required_text(value, "الاسم")

    def validate_committee(self, value):
        return required_text(value, "اسم اللجنة")

    def validate_phone(self, value):
        value = re.sub(r"[\s\-()]", "", ascii_digits(value or ""))
        value = re.sub(r"^(?:\+|00)97[02]", "0", value)
        if value and not re.match(r"^0\d{8,9}$", value):
            raise serializers.ValidationError("رقم الجوال غير صحيح (مثال: 0599123456).")
        return value


class CircularSerializer(TrackedSerializer):
    class Meta:
        model = Circular
        fields = ["id", "title", "body", "pinned", "is_active", "created_at", "updated_at", "created_by_name",
                  "updated_by_name"]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "title": {"error_messages": {"blank": "العنوان مطلوب.", "required": "العنوان مطلوب.",
                                         "max_length": "العنوان طويل جداً (الحد الأقصى 200 حرف)."}},
            "body": {"max_length": 5000, "error_messages": {"blank": "نص التعميم مطلوب.", "required": "نص التعميم مطلوب.",
                                                            "max_length": "النص طويل جداً (الحد الأقصى 5000 حرف)."}},
            "pinned": {"required": False},
        }

    def validate_title(self, value):
        return required_text(value, "العنوان")

    def validate_body(self, value):
        # keep the line breaks, trim each line
        value = "\n".join(clean_text(line) for line in str(value).splitlines()).strip()
        if not value:
            raise serializers.ValidationError("نص التعميم مطلوب.")
        return value
