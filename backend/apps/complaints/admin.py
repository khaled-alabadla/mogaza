from django.contrib import admin

from apps.locations.admin import READONLY

from .models import Complaint, DailyReport, UrgentComplaint


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ["created_at", "kind", "name", "national_id", "phone", "category", "status", "is_active"]
    list_filter = ["kind", "status", "is_active"]
    search_fields = ["name", "national_id", "phone", "category", "address"]
    readonly_fields = READONLY + ["uploaded_at", "uploaded_by"]


@admin.register(UrgentComplaint)
class UrgentComplaintAdmin(admin.ModelAdmin):
    list_display = ["created_at", "number", "name", "category", "phone", "submitted_on", "status", "is_active"]
    list_filter = ["status", "is_active"]
    search_fields = ["number", "name", "phone", "category"]
    readonly_fields = READONLY + ["resolved_at", "resolved_by"]


@admin.register(DailyReport)
class DailyReportAdmin(admin.ModelAdmin):
    list_display = ["report_date", "summons", "archived", "updated_at", "updated_by"]
    readonly_fields = ["updated_at", "updated_by"]
