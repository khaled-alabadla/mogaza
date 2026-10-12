import re

from rest_framework import serializers

from apps.common.validation import code_text
from apps.locations.serializers import TrackedSerializer, user_label
from apps.locations.text import ascii_digits, clean_text

from .models import SEARCH_FIELDS, Complaint

_NATIONAL_ID = re.compile(r"^\d{9}$")
# Local mobile / landline: 0599123456 or 082123456; +970 / 00970 / +972 prefixes become 0.
_PHONE = re.compile(r"^0\d{8,9}$")
_PHONE_PREFIX = re.compile(r"^(?:\+|00)97[02]")

# Plain one-line text fields: (field, Arabic label for messages). Whitespace is collapsed.
TEXT_FIELDS = {
    "name": "الاسم", "category": "النوع", "area": "الحي / المنطقة", "point": "رقم النقطة", "address": "العنوان",
}
# Number-like codes: letters and digits allowed («5A»), checked by code_text.
CODE_FIELDS = {"building_number": "رقم المبنى", "street_number": "رقم الشارع", "subscription": "الاشتراك"}
DETAILS_LIMIT = 3000
EMPTY_RECORD = "أدخل بيانات الشكوى أو الاستفسار: حقل واحد على الأقل."


def _optional(label, limit):
    return {"required": False, "allow_blank": True,
            "error_messages": {"max_length": f"{label} طويل جداً (الحد الأقصى {limit} حرفاً)."}}


class ComplaintSerializer(TrackedSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    channel_display = serializers.CharField(source="get_channel_display", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = ["id", "kind", "kind_display", "hide_identity", *SEARCH_FIELDS, "channel_display", "status",
                  "status_display",
                  "uploaded_at", "uploaded_by_name", "created_at", "updated_at", "created_by_name", "updated_by_name"]
        read_only_fields = ["id", "status", "uploaded_at", "created_at", "updated_at"]
        extra_kwargs = {
            "kind": {"error_messages": {"invalid_choice": "اختر نوع الطلب: شكوى أو استفسار."}},
            "channel": {"required": False, "allow_blank": True,
                        "error_messages": {"invalid_choice": "اختر المصدر: اتصال هاتفي أو فيسبوك أو واتساب."}},
            # every data field is optional; national_id / phone are checked after Arabic digits and spaces
            # are normalized (validate_* below), so no raw max_length on them
            "national_id": {"required": False, "allow_blank": True, "max_length": None},
            "phone": {"required": False, "allow_blank": True, "max_length": None},
            "details": {**_optional("النص", DETAILS_LIMIT), "max_length": DETAILS_LIMIT},
            **{field: _optional(label, Complaint._meta.get_field(field).max_length)
               for field, label in {**TEXT_FIELDS, **CODE_FIELDS}.items()},
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

    def validate_details(self, value):
        # keep the line breaks of a long text, but trim each line and drop blank edges
        return "\n".join(clean_text(line) for line in str(value).splitlines()).strip()

    def validate(self, attrs):
        errors = {}
        for field in TEXT_FIELDS:
            if field in attrs:
                attrs[field] = clean_text(attrs[field])
        for field, label in CODE_FIELDS.items():
            if field in attrs:
                try:
                    attrs[field] = code_text(attrs[field], label)
                except serializers.ValidationError as exc:
                    errors[field] = exc.detail
        if errors:
            raise serializers.ValidationError(errors)
        # All fields are optional, but a record with no data at all is useless
        # (the «إخفاء البيانات» flag alone doesn't count as data).
        merged = {f: getattr(self.instance, f) for f in SEARCH_FIELDS} if self.instance else {}
        merged.update({f: attrs[f] for f in SEARCH_FIELDS if f in attrs})
        if not any(merged.get(f) for f in SEARCH_FIELDS):
            raise serializers.ValidationError(EMPTY_RECORD)
        return attrs


class MarkUploadedSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=500,
                                error_messages={"empty": "اختر شكوى واحدة على الأقل.",
                                                "required": "اختر شكوى واحدة على الأقل."})
    uploaded = serializers.BooleanField(default=True)
