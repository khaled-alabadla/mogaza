import re

from rest_framework import serializers

from apps.common.validation import code_text
from apps.locations.serializers import TrackedSerializer, user_label
from apps.locations.text import ascii_digits, clean_text

from .models import Complaint

_NATIONAL_ID = re.compile(r"^\d{9}$")
# Local mobile / landline: 0599123456 or 082123456; +970 / 00970 / +972 prefixes become 0.
_PHONE = re.compile(r"^0\d{8,9}$")
_PHONE_PREFIX = re.compile(r"^(?:\+|00)97[02]")


DATA_FIELDS = ("national_id", "name", "phone", "point", "building_number", "street_number", "category", "address")


def _length_error(label, limit):
    return {"max_length": f"{label} طويل جداً (الحد الأقصى {limit} حرفاً)."}


class ComplaintSerializer(TrackedSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = ["id", "kind", "kind_display", "national_id", "name", "phone", "point", "building_number",
                  "street_number", "category", "address", "status", "status_display", "uploaded_at",
                  "uploaded_by_name", "created_at", "updated_at", "created_by_name", "updated_by_name"]
        read_only_fields = ["id", "status", "uploaded_at", "created_at", "updated_at"]
        extra_kwargs = {
            "kind": {"error_messages": {"invalid_choice": "اختر نوع الطلب: شكوى أو استفسار."}},
            # every data field is optional; national_id / phone length and format are checked after
            # Arabic digits and spaces are normalized (validate_* below), so no raw max_length here
            "national_id": {"required": False, "allow_blank": True, "max_length": None},
            "phone": {"required": False, "allow_blank": True, "max_length": None},
            "name": {"required": False, "allow_blank": True, "error_messages": _length_error("الاسم", 150)},
            "category": {"required": False, "allow_blank": True,
                         "error_messages": _length_error("نوع الشكوى", 150)},
            "point": {"required": False, "allow_blank": True, "error_messages": _length_error("النقطة", 150)},
            "building_number": {"required": False, "allow_blank": True,
                                "error_messages": _length_error("رقم المبنى", 20)},
            "street_number": {"required": False, "allow_blank": True,
                              "error_messages": _length_error("رقم الشارع", 20)},
            "address": {"required": False, "allow_blank": True, "error_messages": _length_error("العنوان", 300)},
        }

    def get_uploaded_by_name(self, obj):
        return user_label(obj.uploaded_by)

    def validate_national_id(self, value):
        value = ascii_digits(value).replace(" ", "")
        if value and not _NATIONAL_ID.match(value):
            raise serializers.ValidationError("رقم الهوية يجب أن يتكون من 9 أرقام.")
        return value

    def validate_phone(self, value):
        value = re.sub(r"[\s\-()]", "", ascii_digits(value))
        value = _PHONE_PREFIX.sub("0", value)
        if value and not _PHONE.match(value):
            raise serializers.ValidationError("رقم الجوال غير صحيح (مثال: 0599123456).")
        return value

    def validate_name(self, value):
        return clean_text(value)

    def validate_category(self, value):
        return clean_text(value)

    def validate_point(self, value):
        return clean_text(value)

    def validate_address(self, value):
        return clean_text(value)

    def validate_building_number(self, value):
        return code_text(value, "رقم المبنى")

    def validate_street_number(self, value):
        return code_text(value, "رقم الشارع")

    def validate(self, attrs):
        # All fields are optional, but a record with no data at all is useless.
        merged = {field: getattr(self.instance, field, "") for field in DATA_FIELDS} if self.instance else {}
        merged.update({field: attrs[field] for field in DATA_FIELDS if field in attrs})
        if not any(merged.get(field) for field in DATA_FIELDS):
            raise serializers.ValidationError("أدخل بيانات الشكوى: حقل واحد على الأقل.")
        return attrs


class MarkUploadedSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=500,
                                error_messages={"empty": "اختر شكوى واحدة على الأقل.",
                                                "required": "اختر شكوى واحدة على الأقل."})
    uploaded = serializers.BooleanField(default=True)
