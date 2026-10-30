from django.db.models import Case, Exists, IntegerField, OuterRef, Value, When
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import CircularPermission, CommitteePermission, IsAdminRole, SearchPermission, is_admin
from apps.audit.mixins import AuditedViewSetMixin
from apps.audit.models import AuditLog
from apps.common.params import bool_param, int_param, text_param
from apps.water.models import WaterSlot

from .models import Circular, CommitteeRep, Location, StreetName
from .serializers import CircularSerializer, CommitteeRepSerializer, LocationSerializer, StreetNameSerializer
from .text import normalize_for_search, search_terms


class TrackedViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """
    Shared behaviour: server-side Arabic-aware partial search, soft delete,
    restore, and audit logging of every mutation.
    """

    permission_classes = [SearchPermission]
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
        if bool_param(self.request, "no_coordinates"):  # «الخريطة»: the ones still to be placed on it
            qs = qs.filter(latitude__isnull=True)
        return qs

    @action(detail=False, methods=["get"])
    def points(self, request):
        """«الخريطة»: every location that has coordinates, with what its card shows (not paginated)."""
        rows = (Location.active.filter(latitude__isnull=False, longitude__isnull=False)
                .select_related("neighborhood").order_by("id"))
        return Response([{
            "id": l.pk, "place_name": l.place_name, "description": l.description,
            "building_number": l.building_number, "street_number": l.street_number,
            "neighborhood": l.neighborhood_id,
            "neighborhood_name": l.neighborhood.name if l.neighborhood_id else None,
            "latitude": float(l.latitude), "longitude": float(l.longitude),
        } for l in rows])


class StreetNameViewSet(TrackedViewSet):
    model = StreetName
    serializer_class = StreetNameSerializer
    primary_name_field = "common_name"


class CommitteeRepViewSet(TrackedViewSet):
    """«لجان الأحياء»: /api/committees/ (?search=), soft delete + admin restore, audit-logged."""

    model = CommitteeRep
    serializer_class = CommitteeRepSerializer
    permission_classes = [CommitteePermission]
    primary_name_field = "name"


class CircularViewSet(TrackedViewSet):
    """«تعميمات»: /api/circulars/ (?search=), pinned first then the latest; soft delete + admin restore."""

    model = Circular
    serializer_class = CircularSerializer
    permission_classes = [CircularPermission]
    primary_name_field = "title"

    def get_queryset(self):
        qs = super().get_queryset()
        # pinned circulars stay on top, also among search results
        return qs.order_by("-pinned", *(qs.query.order_by or ("-updated_at", "-id")))
