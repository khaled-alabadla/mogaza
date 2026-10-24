from django.contrib import admin

from .models import SiteContent


@admin.register(SiteContent)
class SiteContentAdmin(admin.ModelAdmin):
    list_display = ("key", "updated_at", "updated_by")
    search_fields = ("key",)
