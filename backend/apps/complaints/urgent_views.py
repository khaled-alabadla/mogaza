"""
«الشكاوى العاجلة» — complaints of the main system followed up here until they are resolved:

    GET/POST             /api/urgent-complaints/                ?status=unresolved|resolved  ?search=
    GET/PUT/PATCH/DELETE /api/urgent-complaints/{id}/          (DELETE = soft delete, admin can restore)
    POST                 /api/urgent-complaints/mark-resolved/  {"ids": [...], "resolved": true|false}
    GET                  /api/urgent-complaints/export/         the list's filters → Excel (.xlsx)

Permissions: urgent.view (read), urgent.edit (add / edit / delete / mark), urgent.export (Excel).
"""
from django.db.models import F
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from apps.accounts.permissions import DENIED, has_perm_key
from apps.audit.models import AuditLog
from apps.common.params import text_param
from apps.locations.views import TrackedViewSet

from .excel import build_workbook, xlsx_response
from .models import UrgentComplaint
from .serializers import MarkResolvedSerializer, UrgentComplaintSerializer

EXPORT_COLUMNS = [
    ("serial", "م", 6, "serial"),
    ("number", "رقم الشكوى", 14, "text"),
    ("name", "اسم مقدم الشكوى", 24, "text"),
    ("category", "نوع الشكوى", 22, "text"),
    ("phone", "رقم الجوال", 14, "text"),
    ("submitted_on", "تاريخ التقديم", 14, "day"),
    ("age_days", "مقدمة منذ (يوم)", 12, "number"),
    ("notes", "ملاحظات", 45, "long"),
]


class UrgentPermission(BasePermission):
    message = DENIED

    def has_permission(self, request, view):
        if getattr(view, "action", None) == "export":
            needed = "urgent.export"
        elif request.method in SAFE_METHODS:
            needed = "urgent.view"
        else:
            needed = "urgent.edit"
        # the export also needs the records themselves
        return has_perm_key(request.user, needed) and has_perm_key(request.user, "urgent.view")


class UrgentComplaintViewSet(TrackedViewSet):
    model = UrgentComplaint
    serializer_class = UrgentComplaintSerializer
    permission_classes = [UrgentPermission]
    primary_name_field = "name"

    def get_queryset(self):
        qs = super().get_queryset().select_related("resolved_by")
        if not text_param(self.request, "search"):
            # the oldest complaints first: they are the most urgent (unknown dates after them)
            qs = qs.order_by(F("submitted_on").asc(nulls_last=True), "-created_at", "-id")
        status_filter = text_param(self.request, "status")
        if status_filter in UrgentComplaint.Status.values:
            qs = qs.filter(status=status_filter)
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["unresolved_count"] = UrgentComplaint.active.filter(
            status=UrgentComplaint.Status.UNRESOLVED).count()
        return response

    @action(detail=False, methods=["post"], url_path="mark-resolved")
    def mark_resolved(self, request):
        """Mark complaints as resolved (or back to unresolved)."""
        data = MarkResolvedSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        resolved = data.validated_data["resolved"]
        target = UrgentComplaint.Status.RESOLVED if resolved else UrgentComplaint.Status.UNRESOLVED
        changed = 0
        for record in UrgentComplaint.active.filter(pk__in=data.validated_data["ids"]).exclude(status=target):
            before = record.snapshot()
            record.status = target
            record.resolved_at = timezone.now() if resolved else None
            record.resolved_by = request.user if resolved else None
            record.updated_by = request.user
            record.save(update_fields=["status", "resolved_at", "resolved_by", "updated_by", "updated_at"])
            self.audit(AuditLog.Action.UPDATE, record, before=before, after=record.snapshot())
            changed += 1
        return Response({"updated": changed})

    @action(detail=False, methods=["get"])
    def export(self, request):
        """The filtered list (all pages) as a formatted Excel workbook."""
        if not has_perm_key(request.user, "urgent.export"):
            raise PermissionDenied(DENIED)
        records = list(self.get_queryset().order_by("submitted_on", "created_at", "id"))
        status_filter = text_param(request, "status")
        filters = [f"الحالة: {UrgentComplaint.Status(status_filter).label}" if status_filter in UrgentComplaint.Status.values
                   else "الحالة: الكل"]
        search = text_param(request, "search")
        if search:
            filters.append(f"البحث: «{search[:100]}»")
        content = build_workbook(records, columns=EXPORT_COLUMNS, sheet_name="الشكاوى العاجلة",
                                 title="سجل الشكاوى العاجلة", filters=filters, viewer=request.user)
        return xlsx_response(content, "شكاوى_عاجلة", "urgent_complaints")
