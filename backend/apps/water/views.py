from django.db import transaction
from django.db.models import Count, Exists, IntegerField, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import LocationPermission
from apps.audit.mixins import AuditedViewSetMixin
from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.common.params import int_param, text_param
from apps.locations.models import Location
from apps.locations.text import name_key, search_terms
from config.pagination import StandardPagination

from .models import DAY_LABELS, Neighborhood, WaterSlot, WaterZone, today_info
from .serializers import LocationIdsSerializer, NeighborhoodSerializer, WaterZoneDetailSerializer, WaterZoneSerializer


def _count(queryset, group_field):
    """Correlated COUNT subquery (avoids the row explosion of several joined Count()s)."""
    subquery = queryset.order_by().values(group_field).annotate(n=Count("pk", distinct=True)).values("n")
    return Coalesce(Subquery(subquery, output_field=IntegerField()), 0)


def _location_queryset():
    return Location.objects.select_related("neighborhood", "water_zone__neighborhood")


def _snapshots(locations):
    """{pk: snapshot} of the given locations (taken before a bulk change, for log_location_changes)."""
    return {location.pk: location.snapshot() for location in locations}


def log_location_changes(request, before):
    """Audit an UPDATE for every location whose snapshot changed. `before`: {pk: snapshot}."""
    for location in _location_queryset().filter(pk__in=before):
        after = location.snapshot()
        if after != before[location.pk]:
            log_action(AuditLog.Action.UPDATE, request=request, entity=location, before=before[location.pk],
                       after=after)


class NeighborhoodViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """
    Neighborhoods (الأحياء). The list is small and NOT paginated. Same permissions
    as locations; every write is audit-logged.
    """

    serializer_class = NeighborhoodSerializer
    permission_classes = [LocationPermission]
    pagination_class = None

    def get_queryset(self):
        active = Location.objects.filter(neighborhood=OuterRef("pk"), is_active=True)
        return Neighborhood.objects.annotate(
            locations_count=_count(active, "neighborhood"),
            scheduled_count=_count(active.filter(water_zone__slots__isnull=False), "neighborhood"),
            zones_count=_count(WaterZone.objects.filter(neighborhood=OuterRef("pk")), "neighborhood"),
        ).order_by("sort_order", "name")

    def _respond_annotated(self, serializer):
        # The response carries the computed counts, so serialize a freshly annotated row.
        serializer.instance = self.get_queryset().get(pk=serializer.instance.pk)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._respond_annotated(serializer)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._respond_annotated(serializer)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Both active and soft-deleted locations keep their FK, so either blocks the delete.
        if Location.objects.filter(neighborhood=instance).exists():
            return Response({"detail": "لا يمكن حذف حي مرتبط بمواقع."}, status=status.HTTP_400_BAD_REQUEST)
        if instance.zones.exists():
            return Response({"detail": "لا يمكن حذف حي يحتوي على مناطق مياه."},
                            status=status.HTTP_400_BAD_REQUEST)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ZonePagination(StandardPagination):
    page_size = 50


class WaterZoneViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """
    Water zones (مناطق المياه): a neighborhood is split into zones whose buildings share one
    weekly schedule. Read: LocationPermission semantics; write: admin/editor. Audited as "waterzone".
    """

    permission_classes = [LocationPermission]
    pagination_class = ZonePagination

    def get_serializer_class(self):
        return WaterZoneSerializer if self.action == "list" else WaterZoneDetailSerializer

    def annotated(self):
        qs = WaterZone.objects.select_related("neighborhood").prefetch_related("slots").annotate(
            locations_count=_count(Location.objects.filter(water_zone=OuterRef("pk"), is_active=True), "water_zone"))
        if self.action != "list":
            qs = qs.prefetch_related(Prefetch("locations", to_attr="active_locations",
                                              queryset=Location.active.order_by("place_name", "id")))
        return qs

    def filtered(self, qs, with_day=True):
        neighborhood = int_param(self.request, "neighborhood")
        if neighborhood is not None:
            qs = qs.filter(neighborhood_id=neighborhood)
        day = int_param(self.request, "day", 0, 6) if with_day else None
        if day is not None:
            qs = qs.filter(Exists(WaterSlot.objects.filter(zone=OuterRef("pk"), day=day)))
        query = text_param(self.request, "search")
        terms = search_terms(query)
        if terms:
            # Zone and neighborhood names are matched in Python (the table is small); buildings use the
            # pre-normalized search_text column of locations, like the location search.
            zone_texts = [(pk, name_key(f"{name} {code} {hood}")) for pk, name, code, hood
                          in WaterZone.objects.values_list("pk", "name", "code", "neighborhood__name")]
            for term in terms:
                key = name_key(term)
                ids = [pk for pk, text in zone_texts if key in text]
                in_buildings = Location.objects.filter(water_zone=OuterRef("pk"), is_active=True,
                                                       search_text__contains=term)
                qs = qs.filter(Q(pk__in=ids) | Exists(in_buildings))
        return qs

    def get_queryset(self):
        qs = self.annotated()
        if self.action == "list":
            qs = self.filtered(qs)
        return qs.order_by("neighborhood__sort_order", "neighborhood__name", "sort_order", "name", "id")

    def _detail(self, instance):
        return WaterZoneDetailSerializer(self.annotated().get(pk=instance.pk), context=self.get_serializer_context()).data

    def perform_create(self, serializer):
        super().perform_create(serializer)
        serializer.instance = self.annotated().get(pk=serializer.instance.pk)  # detail with counts/locations

    @transaction.atomic
    def perform_update(self, serializer):
        request = self.request
        before = serializer.instance.snapshot()
        old_neighborhood = serializer.instance.neighborhood_id
        instance = serializer.save()
        instance = WaterZone.objects.select_related("neighborhood").get(pk=instance.pk)  # fresh slots
        self.audit(AuditLog.Action.UPDATE, instance, before=before, after=instance.snapshot())
        if instance.neighborhood_id != old_neighborhood:
            # Rule: a building's neighborhood follows its zone.
            locations = _location_queryset().filter(water_zone=instance)
            snapshots = _snapshots(locations)
            locations.update(neighborhood=instance.neighborhood, updated_by=request.user, updated_at=timezone.now())
            log_location_changes(request, snapshots)
        serializer.instance = self.annotated().get(pk=instance.pk)  # detail with counts/locations

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """Hard delete; slots cascade and the zone's buildings are left without a zone (SET_NULL)."""
        instance = self.get_object()
        location_ids = list(Location.objects.filter(water_zone=instance).values_list("pk", flat=True))
        self.audit(AuditLog.Action.DELETE, instance, before=instance.snapshot(location_ids=location_ids))
        snapshots = _snapshots(_location_queryset().filter(pk__in=location_ids))
        instance.delete()
        Location.objects.filter(pk__in=location_ids).update(updated_by=request.user, updated_at=timezone.now())
        log_location_changes(request, snapshots)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _change_membership(self, request, assign):
        zone = self.get_object()
        serializer = LocationIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = set(serializer.validated_data["location_ids"])
        locations = _location_queryset().filter(pk__in=ids, is_active=True)
        if assign and len(locations) != len(ids):
            return Response({"location_ids": ["بعض المواقع المحددة غير موجودة."]}, status=status.HTTP_400_BAD_REQUEST)
        if not assign:
            locations = locations.filter(water_zone=zone)
        with transaction.atomic():
            before_ids = list(Location.objects.filter(water_zone=zone).values_list("pk", flat=True))
            zone_before = zone.snapshot(location_ids=before_ids)
            snapshots = _snapshots(locations)
            changes = {"water_zone": zone if assign else None, "updated_by": request.user,
                       "updated_at": timezone.now()}
            if assign:
                changes["neighborhood"] = zone.neighborhood
            Location.objects.filter(pk__in=snapshots).update(**changes)
            after_ids = list(Location.objects.filter(water_zone=zone).values_list("pk", flat=True))
            self.audit(AuditLog.Action.UPDATE, zone, before=zone_before, after=zone.snapshot(location_ids=after_ids))
            log_location_changes(request, snapshots)
        return Response(self._detail(zone))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        return self._change_membership(request, assign=True)

    @action(detail=True, methods=["post"])
    def unassign(self, request, pk=None):
        return self._change_membership(request, assign=False)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        zones = WaterZone.objects.all()
        located = Location.active.filter(water_zone__isnull=False)
        neighborhood = int_param(request, "neighborhood")
        if neighborhood is not None:
            zones = zones.filter(neighborhood_id=neighborhood)
            located = located.filter(water_zone__neighborhood_id=neighborhood)
        counts = dict(WaterSlot.objects.filter(zone__in=zones).order_by().values_list("day")
                      .annotate(n=Count("zone_id", distinct=True)))
        return Response({
            **today_info(),
            "days": [{"day": day, "label": label, "count": counts.get(day, 0)}
                     for day, label in enumerate(DAY_LABELS)],
            "zones_count": zones.count(),
            "locations_count": located.count(),
        })
