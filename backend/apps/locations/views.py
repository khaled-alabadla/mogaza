from django.db.models import Case, Exists, IntegerField, OuterRef, Value, When
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminRole, LocationPermission, is_admin
from apps.audit.mixins import AuditedViewSetMixin
from apps.audit.models import AuditLog
from apps.common.params import bool_param, int_param, text_param
from apps.water.models import WaterSlot

from .models import Location, StreetName
from .serializers import LocationSerializer, StreetNameSerializer
from .text import normalize_for_search, search_terms


class TrackedViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """
    Shared behaviour: server-side Arabic-aware partial search, soft delete,
    restore, and audit logging of every mutation.
    """

    permission_classes = [LocationPermission]
    model = None
    primary_name_field = None  # matches in this field are ranked first

    def get_queryset(self):
        qs = self.model.objects.select_related("created_by", "updated_by")
        wants_deleted = self.request.query_params.get("status") == "deleted"
        # Deleted records are only visible to administrators (list view and restore action).
        if self.action == "restore" or (wants_deleted and is_admin(self.request.user)):
            qs = qs.filter(is_active=False)
        else:
            qs = qs.filter(is_active=True)

        query = text_param(self.request, "search")
        terms = search_terms(query)
        if terms:
            for term in terms:
                # search_text is pre-normalized, so a plain LIKE can use the pg_trgm GIN index.
                qs = qs.filter(search_text__contains=term)
            qs = qs.annotate(rank=Case(
                When(search_text__startswith=normalize_for_search(query), then=Value(0)),
                When(**{f"{self.primary_name_field}__icontains": query}, then=Value(1)),
                default=Value(2),
                output_field=IntegerField(),
            )).order_by("rank", self.primary_name_field, "id")
        return qs

    def save_kwargs(self, created):
        user = self.request.user
        return {"created_by": user, "updated_by": user} if created else {"updated_by": user}

    def _set_active(self, instance, active, audit_action):
        """Soft delete (active=False) or restore, audit-logged with before/after snapshots."""
        user = self.request.user
        before = instance.snapshot()
        instance.is_active = active
        instance.deleted_at = None if active else timezone.now()
        instance.deleted_by = None if active else user
        instance.updated_by = user
        instance.save(update_fields=["is_active", "deleted_at", "deleted_by", "updated_by", "updated_at"])
        self.audit(audit_action, instance, before=before, after=instance.snapshot())

    def perform_destroy(self, instance):
        """Soft delete: the record is kept but hidden from normal search."""
        self._set_active(instance, False, AuditLog.Action.DELETE)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def restore(self, request, pk=None):
        instance = self.get_object()
        self._set_active(instance, True, AuditLog.Action.RESTORE)
        return Response(self.get_serializer(instance).data)


class LocationViewSet(TrackedViewSet):
    model = Location
    serializer_class = LocationSerializer
    primary_name_field = "place_name"

    def get_queryset(self):
        qs = (super().get_queryset().select_related("neighborhood", "water_zone__neighborhood")
              .prefetch_related("water_zone__slots"))
        for param in ("neighborhood", "water_zone"):
            value = int_param(self.request, param)
            if value is not None:
                qs = qs.filter(**{f"{param}_id": value})
        if bool_param(self.request, "has_schedule"):
            qs = qs.filter(Exists(WaterSlot.objects.filter(zone=OuterRef("water_zone"))))
        return qs


class StreetNameViewSet(TrackedViewSet):
    model = StreetName
    serializer_class = StreetNameSerializer
    primary_name_field = "common_name"
