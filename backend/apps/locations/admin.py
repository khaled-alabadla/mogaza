from django.contrib import admin

from .models import Location, StreetName

READONLY = ["created_at", "updated_at", "created_by", "updated_by", "deleted_at", "deleted_by"]


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ["place_name", "description", "building_number", "street_number", "neighborhood", "water_zone", "is_active",
                    "updated_at"]
    list_filter = ["is_active", "neighborhood"]
    search_fields = ["place_name", "description", "building_number", "street_number"]
    readonly_fields = READONLY


@admin.register(StreetName)
class StreetNameAdmin(admin.ModelAdmin):
    list_display = ["common_name", "official_name", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["common_name", "official_name"]
    readonly_fields = READONLY
