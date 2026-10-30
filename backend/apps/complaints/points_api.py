"""
Complaints marked on «الخريطة» («شكوى على الخريطة»): where a complaint is, with its number and type.

    GET    /api/complaint-points/          all of them (not paginated)
    POST   /api/complaint-points/          {number, category, latitude, longitude}   (all required)
    PATCH  /api/complaint-points/{id}/     same fields
    DELETE /api/complaint-points/{id}/

Read: complaints.view. Write: complaints.edit. Audited as "complaintpoint".
"""
from rest_framework import serializers, viewsets

from apps.accounts.permissions import key_permission
from apps.audit.mixins import AuditedViewSetMixin
from apps.common.validation import required_text

from .models import ComplaintPoint

# [south, north, west, east] around Gaza City (with a margin): the point must fall inside
GAZA_BOX = (31.42, 31.62, 34.33, 34.55)

ComplaintPointPermission = key_permission("complaints.view", "complaints.edit")


class ComplaintPointSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ComplaintPoint
        fields = ["id", "number", "category", "latitude", "longitude", "created_at", "created_by_name"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {
            "number": {"error_messages": {"blank": "رقم الشكوى مطلوب.", "required": "رقم الشكوى مطلوب.",
                                          "max_length": "رقم الشكوى طويل جداً (الحد الأقصى 50 حرفاً)."}},
            "category": {"error_messages": {"blank": "نوع الشكوى مطلوب.", "required": "نوع الشكوى مطلوب.",
                                            "max_length": "نوع الشكوى طويل جداً (الحد الأقصى 150 حرفاً)."}},
            "latitude": {"error_messages": {"required": "حدد مكان الشكوى على الخريطة."}},
            "longitude": {"error_messages": {"required": "حدد مكان الشكوى على الخريطة."}},
        }

    def get_created_by_name(self, obj):
        user = obj.created_by
        viewer = self.context["request"].user
        # the hidden developer account is never named to others
        if not user or (user.is_superuser and not viewer.is_superuser):
            return None
        return user.get_full_name() or user.get_username()

    def validate_number(self, value):
        return required_text(value, "رقم الشكوى")

    def validate_category(self, value):
        return required_text(value, "نوع الشكوى")

    def validate(self, attrs):
        lat = attrs.get("latitude", getattr(self.instance, "latitude", None))
        lng = attrs.get("longitude", getattr(self.instance, "longitude", None))
        if lat is None or lng is None or not (GAZA_BOX[0] <= lat <= GAZA_BOX[1] and GAZA_BOX[2] <= lng <= GAZA_BOX[3]):
            raise serializers.ValidationError({"latitude": "مكان الشكوى خارج مدينة غزة."})
        return attrs


class ComplaintPointViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = ComplaintPointSerializer
    permission_classes = [ComplaintPointPermission]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    audit_entity_type = "complaintpoint"

    def get_queryset(self):
        return ComplaintPoint.objects.select_related("created_by")

    def save_kwargs(self, created):
        user = self.request.user
        return {"created_by": user, "updated_by": user} if created else {"updated_by": user}
