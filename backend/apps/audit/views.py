from rest_framework import viewsets

from apps.accounts.permissions import IsAdminRole
from apps.common.params import text_param

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only audit trail, visible to administrators only."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        # No select_related("user"): the serializer only exposes the user id (user_id column).
        qs = AuditLog.objects.all()
        filters = {field: field for field in ("action", "entity_type", "entity_id")}  # exact match
        filters.update(user="username__icontains", search="entity_repr__icontains")  # partial match
        for param, lookup in filters.items():
            value = text_param(self.request, param)
            if value:
                qs = qs.filter(**{lookup: value})
        return qs
