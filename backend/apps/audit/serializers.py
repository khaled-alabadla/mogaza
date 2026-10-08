from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "timestamp", "user", "username", "action", "action_display", "entity_type",
                  "entity_id", "entity_repr", "before_data", "after_data", "ip_address"]
        read_only_fields = fields
