"""
Temporary complaints log («الشكاوى المؤقتة»), used while the main complaints system is down:

    GET/POST            /api/complaints/            ?upload=pending|uploaded  ?kind=complaint|inquiry  ?search=
                        (a complaint and an inquiry have different fields, as in the main system's forms)
    GET/PUT/PATCH/DELETE /api/complaints/{id}/       (DELETE = soft delete, admin can restore)
    POST                /api/complaints/mark-uploaded/   {"ids": [...], "uploaded": true|false}
    GET                 /api/complaints/export/      ?kind= (required) + the list's filters → Excel (.xlsx)

Per-user permissions, by kind (the records hold citizens' ID and phone numbers):
complaints.view / .edit / .export and inquiries.view / .edit / .export. A user only ever sees the kinds
they may view; adding, editing, deleting and marking «تم الرفع» need «<kind>.edit» for every record touched.
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from apps.accounts.permissions import DENIED, has_perm_key
from apps.audit.models import AuditLog
from apps.common.params import text_param
from apps.locations.views import TrackedViewSet

from .excel import build_workbook, xlsx_response
from .models import Complaint
from .serializers import ComplaintSerializer, MarkUploadedSerializer

KIND_REQUIRED = "اختر نوع السجل المراد تصديره: شكاوى (complaint) أو استفسارات (inquiry)."
KINDS = Complaint.Kind.values


def allowed_kinds(user, action):
    """The kinds whose «<kind>.<action>» permission the user holds."""
    return [kind for kind in KINDS if has_perm_key(user, Complaint.perm_key(kind, action))]


class ComplaintPermission(BasePermission):
    """Coarse gate (some kind allowed); the view then checks the kind of every record touched."""

    message = DENIED

    def has_permission(self, request, view):
        if getattr(view, "action", None) == "export":
            needed = "export"
        elif request.method in SAFE_METHODS:
            needed = "view"
        else:
            needed = "edit"
        return bool(allowed_kinds(request.user, needed))


# --- Excel export ---------------------------------------------------------------------------------------------
# Columns of each kind, in the order of that kind's form: (field, header, width, cell type — see excel.cell_value).
EXPORT_COLUMNS = {
    Complaint.Kind.COMPLAINT: [
        ("serial", "م", 6, "serial"),
        ("hide_identity", "إخفاء بيانات صاحب الشكوى", 14, "bool"),
        ("national_id", "رقم الهوية", 14, "text"),
        ("name", "الاسم", 24, "text"),
        ("phone", "رقم الجوال", 14, "text"),
        ("point", "رقم النقطة", 14, "text"),
        ("building_number", "رقم المبنى", 12, "text"),
        ("street_number", "رقم الشارع", 12, "text"),
        ("category", "نوع الشكوى", 20, "text"),
        ("channel", "المصدر", 14, "choice"),
        ("address", "العنوان", 28, "long"),
        ("details", "تفاصيل الشكوى", 45, "long"),
        ("status", "الحالة", 14, "choice"),
        ("created_at", "تاريخ التسجيل", 18, "date"),
        ("created_by", "سجّلها", 18, "user"),
        ("uploaded_at", "تاريخ الرفع", 18, "date"),
    ],
    Complaint.Kind.INQUIRY: [
        ("serial", "م", 6, "serial"),
        ("national_id", "رقم الهوية", 14, "text"),
        ("name", "الاسم", 24, "text"),
        ("phone", "رقم الجوال", 14, "text"),
        ("category", "نوع الاستفسار", 22, "text"),
        ("channel", "المصدر", 14, "choice"),
        ("area", "الحي", 18, "text"),
        ("details", "نص الاستفسار", 50, "long"),
        ("status", "الحالة", 14, "choice"),
        ("created_at", "تاريخ التسجيل", 18, "date"),
        ("created_by", "سجّلها", 18, "user"),
        ("uploaded_at", "تاريخ الرفع", 18, "date"),
    ],
}
EXPORT_TITLES = {Complaint.Kind.COMPLAINT: "سجل الشكاوى المؤقتة", Complaint.Kind.INQUIRY: "سجل الاستفسارات"}
EXPORT_FILE_NAMES = {Complaint.Kind.COMPLAINT: ("شكاوى", "complaints"),
                     Complaint.Kind.INQUIRY: ("استفسارات", "inquiries")}


def _filter_description(request):
    parts = []
    upload = text_param(request, "upload")
    parts.append(f"الحالة: {Complaint.Status(upload).label}" if upload in Complaint.Status.values
                 else "الحالة: الكل")
    search = text_param(request, "search")
    if search:
        parts.append(f"البحث: «{search[:100]}»")
    return parts


class ComplaintViewSet(TrackedViewSet):
    model = Complaint
    serializer_class = ComplaintSerializer
    permission_classes = [ComplaintPermission]
    primary_name_field = "name"

    def get_queryset(self):
        # only the kinds this user may see (others answer 404, as if they did not exist)
        qs = (super().get_queryset().select_related("uploaded_by")
              .filter(kind__in=allowed_kinds(self.request.user, "view")))
        upload = text_param(self.request, "upload")
        if upload in Complaint.Status.values:
            qs = qs.filter(status=upload)
        kind = text_param(self.request, "kind")
        if kind in KINDS:
            qs = qs.filter(kind=kind)
        return qs

    def check_edit(self, *kinds):
        for kind in kinds:
            if not has_perm_key(self.request.user, Complaint.perm_key(kind, "edit")):
                raise PermissionDenied(DENIED)

    def perform_create(self, serializer):
        self.check_edit(serializer.validated_data.get("kind", Complaint.Kind.COMPLAINT))
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self.check_edit(serializer.instance.kind, serializer.validated_data.get("kind", serializer.instance.kind))
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self.check_edit(instance.kind)
        super().perform_destroy(instance)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # how many (of the selected kind) are still waiting to be entered into the main system (tab badge)
        pending = Complaint.active.filter(status=Complaint.Status.PENDING,
                                          kind__in=allowed_kinds(request.user, "view"))
        kind = text_param(request, "kind")
        if kind in KINDS:
            pending = pending.filter(kind=kind)
        response.data["pending_count"] = pending.count()
        return response

    @action(detail=False, methods=["post"], url_path="mark-uploaded")
    def mark_uploaded(self, request):
        """Mark complaints as entered into the main system (or back to pending). 403 if any is not editable."""
        data = MarkUploadedSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        uploaded = data.validated_data["uploaded"]
        target = Complaint.Status.UPLOADED if uploaded else Complaint.Status.PENDING
        records = list(Complaint.active.filter(pk__in=data.validated_data["ids"],
                                               kind__in=allowed_kinds(request.user, "view")))
        self.check_edit(*{record.kind for record in records})
        changed = 0
        for complaint in records:
            if complaint.status == target:
                continue
            before = complaint.snapshot()
            complaint.status = target
            complaint.uploaded_at = timezone.now() if uploaded else None
            complaint.uploaded_by = request.user if uploaded else None
            complaint.updated_by = request.user
            complaint.save(update_fields=["status", "uploaded_at", "uploaded_by", "updated_by", "updated_at"])
            self.audit(AuditLog.Action.UPDATE, complaint, before=before, after=complaint.snapshot())
            changed += 1
        return Response({"updated": changed})

    @action(detail=False, methods=["get"])
    def export(self, request):
        """The filtered list of one kind (all pages) as a formatted Excel workbook."""
        kind = text_param(request, "kind")
        if kind not in KINDS:
            return Response({"kind": [KIND_REQUIRED]}, status=status.HTTP_400_BAD_REQUEST)
        if not has_perm_key(request.user, Complaint.perm_key(kind, "export")):
            raise PermissionDenied(DENIED)
        records = list(self.get_queryset().select_related("created_by").order_by("created_at", "id"))
        arabic, ascii_name = EXPORT_FILE_NAMES[kind]
        content = build_workbook(records, columns=EXPORT_COLUMNS[kind], sheet_name=arabic, title=EXPORT_TITLES[kind],
                                 filters=_filter_description(request), viewer=request.user)
        return xlsx_response(content, arabic, ascii_name)
