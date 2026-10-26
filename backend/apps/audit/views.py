import re
from difflib import SequenceMatcher

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import viewsets

from apps.accounts.permissions import IsAdminRole
from apps.common.params import text_param

from .models import AuditLog
from .serializers import AuditLogSerializer

User = get_user_model()


def letters_only(value):
    """«Bilal7_Qanoa» → «bilalqanoa»: lower-case, without digits, dots, dashes…"""
    return re.sub(r"[\W\d_]+", "", (value or "").lower())


def looks_like(typed, names):
    """The typed name is one of the names, or a close misspelling of one (at most a letter or two off)."""
    return bool(typed) and any(typed == n or (len(typed) >= 4 and SequenceMatcher(None, typed, n).ratio() >= 0.85)
                               for n in names)


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
        superusers = list(User.objects.filter(is_superuser=True).values_list("pk", "username", "email"))
        traces = Q(user_id__in=[pk for pk, _, _ in superusers]) | Q(
            entity_type="user", entity_id__in=[str(pk) for pk, _, _ in superusers])
        # Failed logins keep the name as typed: hide those that look like the developer's username or e-mail,
        # mistyped too («BILAL7QANOA», «bilalqanoa», «bilalqanoa@gmail.com»).
        names = {letters_only(n) for _, username, email in superusers
                 for n in (username, email.split("@")[0], settings.DEVELOPER_EMAIL.split("@")[0]) if n}
        names.discard("")
        if names:
            typed = AuditLog.objects.filter(action=AuditLog.Action.LOGIN_FAILED).values_list(
                "username", flat=True).distinct()
            lookalikes = [t for t in typed if looks_like(letters_only(t.split("@")[0]), names)]
            if lookalikes:
                traces |= Q(action=AuditLog.Action.LOGIN_FAILED, username__in=lookalikes)
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
