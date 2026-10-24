"""
«التقرير اليومي» — only the latest report is kept:

    GET  /api/daily-report/     the latest report (or {"report": null} before the first one)   report.view
    PUT  /api/daily-report/     replace it                                                       report.edit
"""
from django.db import transaction
from rest_framework import serializers
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import DENIED, has_perm_key
from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.locations.serializers import visible_user_label
from apps.locations.text import clean_text

from .models import DailyReport

MAX_COUNT = 100_000


class ReportRowSerializer(serializers.Serializer):
    source = serializers.CharField(max_length=60, error_messages={
        "blank": "اكتب اسم المصدر.", "required": "اكتب اسم المصدر.",
        "max_length": "اسم المصدر طويل جداً."})
    complaints = serializers.IntegerField(min_value=0, max_value=MAX_COUNT, default=0)
    inquiries = serializers.IntegerField(min_value=0, max_value=MAX_COUNT, default=0)

    def validate_source(self, value):
        return clean_text(value)


class DailyReportSerializer(serializers.Serializer):
    report_date = serializers.DateField(error_messages={"invalid": "تاريخ غير صحيح.", "required": "اختر تاريخ التقرير.",
                                                        "null": "اختر تاريخ التقرير."})
    rows = ReportRowSerializer(many=True, max_length=20, allow_empty=False,
                               error_messages={"empty": "أضف مصدراً واحداً على الأقل."})
    summons = serializers.IntegerField(min_value=0, max_value=MAX_COUNT, default=0)
    archived = serializers.IntegerField(min_value=0, max_value=MAX_COUNT, default=0)


def present(report, viewer):
    if report is None:
        return None
    return {"report_date": report.report_date, "rows": report.rows, "summons": report.summons,
            "archived": report.archived, "updated_at": report.updated_at,
            "updated_by_name": visible_user_label(report.updated_by, viewer)}


class ReportPermission(BasePermission):
    message = DENIED

    def has_permission(self, request, view):
        needed = "report.view" if request.method in SAFE_METHODS else "report.edit"
        return has_perm_key(request.user, needed)


class DailyReportView(APIView):
    permission_classes = [ReportPermission]

    def get(self, request):
        report = DailyReport.objects.select_related("updated_by").filter(pk=1).first()
        return Response({"report": present(report, request.user)})

    def put(self, request):
        data = DailyReportSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        values["rows"] = [dict(row) for row in values["rows"]]
        with transaction.atomic():
            before = DailyReport.objects.filter(pk=1).first()
            before_snapshot = before.snapshot() if before else None
            report, _ = DailyReport.objects.update_or_create(pk=1, defaults={**values, "updated_by": request.user})
        log_action(AuditLog.Action.UPDATE, request=request, entity=report, entity_type="dailyreport",
                   before=before_snapshot, after=report.snapshot())
        return Response({"report": present(report, request.user)})
