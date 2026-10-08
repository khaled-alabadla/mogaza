from django.contrib import admin

from apps.locations.admin import READONLY

from .models import Complaint


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ["created_at", "kind", "name", "national_id", "phone", "category", "status", "is_active"]
    list_filter = ["kind", "status", "is_active"]
    search_fields = ["name", "national_id", "phone", "category", "address"]
    readonly_fields = READONLY + ["uploaded_at", "uploaded_by"]
