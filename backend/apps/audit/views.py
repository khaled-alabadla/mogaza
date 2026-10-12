from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import viewsets

from apps.accounts.permissions import IsAdminRole
from apps.common.params import text_param

from .models import AuditLog
from .serializers import AuditLogSerializer

User = get_user_model()


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only audit trail, visible to administrators only."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]

    @staticmethod
    def superuser_traces():
        """
        Entries that would reveal the hidden developer (superuser) account to other admins: whatever it did
        (logins, logouts, edits), failed logins with its username, and changes to the account itself.
        """
        superusers = list(User.objects.filter(is_superuser=True).values_list("pk", "username"))
        traces = Q(user_id__in=[pk for pk, _ in superusers]) | Q(
            entity_type="user", entity_id__in=[str(pk) for pk, _ in superusers])
        for _, username in superusers:  # failed logins keep the name as typed («BILAL7QANOA»)
            traces |= Q(username__iexact=username)
        return traces

    def get_queryset(self):
        # No select_related("user"): the serializer only exposes the user id (user_id column).
        qs = AuditLog.objects.all()
        if not self.request.user.is_superuser:
            qs = qs.exclude(self.superuser_traces())
        filters = {field: field for field in ("action", "entity_type", "entity_id")}  # exact match
        filters.update(user="username__icontains", search="entity_repr__icontains")  # partial match
        for param, lookup in filters.items():
            value = text_param(self.request, param)
            if value:
                qs = qs.filter(**{lookup: value})
        return qs
