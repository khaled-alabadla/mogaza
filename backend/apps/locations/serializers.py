from rest_framework import serializers

from apps.common.validation import code_text, required_text
from apps.water.models import Neighborhood, WaterZone, schedule_text
from apps.water.serializers import NEIGHBORHOOD_ERRORS, slot_data

from .models import Location, StreetName
from .text import clean_text

def user_label(user):
    if not user:
        return None
    return user.get_full_name() or user.get_username()


class TrackedSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        return user_label(obj.created_by)

    def get_updated_by_name(self, obj):
        return user_label(obj.updated_by)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        # Anonymous visitors (public search) do not see who edited the record.
        if not (request and request.user.is_authenticated):
            for key in ("created_by_name", "updated_by_name", "created_at", "updated_at"):
                data.pop(key, None)
        return data


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
                  "created_at", "updated_at", "created_by_name", "updated_by_name"]
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
        """Keep the building's neighborhood equal to its zone's neighborhood."""
        zone = attrs.get("water_zone")
        if zone is not None:
            attrs["neighborhood"] = zone.neighborhood
        elif "neighborhood" in attrs and "water_zone" not in attrs and self.instance is not None:
            current = self.instance.water_zone
            if current is not None and current.neighborhood_id != getattr(attrs["neighborhood"], "pk", None):
                attrs["water_zone"] = None  # moved to another neighborhood: the old zone no longer applies
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
        fields = ["id", "common_name", "official_name", "is_active", "created_at", "updated_at",
                  "created_by_name", "updated_by_name"]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "common_name": {"error_messages": {"blank": "الاسم الشائع مطلوب.", "required": "الاسم الشائع مطلوب."}},
            "official_name": {"error_messages": {"blank": "الاسم الرسمي مطلوب.", "required": "الاسم الرسمي مطلوب."}},
        }

    def validate_common_name(self, value):
        return required_text(value, "الاسم الشائع")

    def validate_official_name(self, value):
        return required_text(value, "الاسم الرسمي")
