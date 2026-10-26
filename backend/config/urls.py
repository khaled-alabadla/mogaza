from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (ChangePasswordView, LoginView, LogoutView, MeView, PermissionCatalogView,
                                 UserViewSet)
from apps.audit.views import AuditLogViewSet
from apps.complaints.report_views import DailyReportView
from apps.complaints.urgent_views import UrgentComplaintViewSet
from apps.complaints.views import ComplaintViewSet
from apps.devpanel.views import ContentItemView, ContentView, OtpRequestView, OtpVerifyView
from apps.locations.views import CommitteeRepViewSet, LocationViewSet, StreetNameViewSet
from apps.water.views import NeighborhoodViewSet, WaterZoneViewSet
from apps.water.table_api import DistributionGroupViewSet

router = DefaultRouter()
router.register("locations", LocationViewSet, basename="location")
router.register("streets", StreetNameViewSet, basename="street")
router.register("committees", CommitteeRepViewSet, basename="committee")
router.register("neighborhoods", NeighborhoodViewSet, basename="neighborhood")
router.register("water-zones", WaterZoneViewSet, basename="water-zone")
router.register("water-table", DistributionGroupViewSet, basename="water-table")
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("urgent-complaints", UrgentComplaintViewSet, basename="urgent-complaint")
router.register("users", UserViewSet, basename="user")
router.register("audit-logs", AuditLogViewSet, basename="auditlog")

urlpatterns = [
    path("api/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/auth/me/", MeView.as_view(), name="auth-me"),
    path("api/auth/permissions/", PermissionCatalogView.as_view(), name="auth-permissions"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("api/daily-report/", DailyReportView.as_view(), name="daily-report"),
    path("api/content/", ContentView.as_view(), name="content"),
    path("api/dev/otp/request/", OtpRequestView.as_view(), name="dev-otp-request"),
    path("api/dev/otp/verify/", OtpVerifyView.as_view(), name="dev-otp-verify"),
    path("api/dev/content/<str:key>/", ContentItemView.as_view(), name="dev-content"),
    path("api/", include(router.urls)),
    path("django-admin/", admin.site.urls),
]
