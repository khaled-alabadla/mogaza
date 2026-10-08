from django.contrib import admin

from .models import Neighborhood, WaterSlot, WaterZone


@admin.register(Neighborhood)
class NeighborhoodAdmin(admin.ModelAdmin):
    list_display = ["name", "sort_order"]
    search_fields = ["name"]
    ordering = ["sort_order", "name"]


class WaterSlotInline(admin.TabularInline):
    model = WaterSlot
    extra = 0
    fields = ["day", "start_time", "end_time", "note", "source"]


@admin.register(WaterZone)
class WaterZoneAdmin(admin.ModelAdmin):
    list_display = ["name", "neighborhood", "code", "sort_order", "updated_at"]
    list_filter = ["neighborhood"]
    search_fields = ["name", "code", "neighborhood__name"]
    inlines = [WaterSlotInline]
