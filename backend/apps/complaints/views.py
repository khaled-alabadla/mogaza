"""
Temporary complaints log («الشكاوى المؤقتة»), used while the main complaints system is down:

    GET/POST            /api/complaints/            ?upload=pending|uploaded  ?kind=complaint|inquiry  ?search=
    GET/PUT/PATCH/DELETE /api/complaints/{id}/       (DELETE = soft delete, admin can restore)
    POST                /api/complaints/mark-uploaded/   {"ids": [...], "uploaded": true|false}
    GET                 /api/complaints/export/      same filters → CSV (UTF-8 with BOM, opens in Excel)

Admins and editors only (the records hold citizens' ID and phone numbers).
"""
import csv

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsEditorRole
from apps.audit.models import AuditLog
from apps.common.params import text_param
from apps.locations.views import TrackedViewSet

from .models import Complaint
from .serializers import ComplaintSerializer, MarkUploadedSerializer

EXPORT_COLUMNS = [
    ("kind", "النوع"), ("national_id", "رقم الهوية"), ("name", "الاسم"), ("phone", "رقم الجوال"),
    ("point", "النقطة"), ("building_number", "رقم المبنى"), ("street_number", "رقم الشارع"),
    ("category", "نوع الشكوى"), ("address", "العنوان"), ("status", "الحالة"), ("created_at", "تاريخ التسجيل"),
]


class ComplaintViewSet(TrackedViewSet):
    model = Complaint
    serializer_class = ComplaintSerializer
    permission_classes = [IsEditorRole]
    primary_name_field = "name"

    def get_queryset(self):
        qs = super().get_queryset().select_related("uploaded_by")
        upload = text_param(self.request, "upload")
        if upload in Complaint.Status.values:
            qs = qs.filter(status=upload)
        kind = text_param(self.request, "kind")
        if kind in Complaint.Kind.values:
            qs = qs.filter(kind=kind)
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # how many are still waiting to be entered into the main system (for the tab badge)
        response.data["pending_count"] = Complaint.active.filter(status=Complaint.Status.PENDING).count()
        return response

    @action(detail=False, methods=["post"], url_path="mark-uploaded")
    def mark_uploaded(self, request):
        """Mark complaints as entered into the main system (or back to pending)."""
        data = MarkUploadedSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        uploaded = data.validated_data["uploaded"]
        target = Complaint.Status.UPLOADED if uploaded else Complaint.Status.PENDING
        changed = 0
        for complaint in Complaint.active.filter(pk__in=data.validated_data["ids"]).exclude(status=target):
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
        """The filtered list as a CSV file (all pages)."""
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        stamp = timezone.localtime().strftime("%Y-%m-%d_%H-%M")
        response["Content-Disposition"] = f'attachment; filename="complaints_{stamp}.csv"'
        response.write("﻿")  # BOM: Excel then opens the Arabic text correctly
        writer = csv.writer(response)
        writer.writerow([label for _, label in EXPORT_COLUMNS])
        for complaint in self.get_queryset().order_by("created_at", "id"):
            row = []
            for field, _ in EXPORT_COLUMNS:
                if field in ("kind", "status"):
                    row.append(getattr(complaint, f"get_{field}_display")())
                elif field == "created_at":
                    row.append(timezone.localtime(complaint.created_at).strftime("%Y-%m-%d %H:%M"))
                else:
                    # "=..." style values would run as formulas in Excel: neutralize them
                    value = getattr(complaint, field)
                    row.append(f"'{value}" if value[:1] in ("=", "+", "-", "@") else value)
            writer.writerow(row)
        return response
