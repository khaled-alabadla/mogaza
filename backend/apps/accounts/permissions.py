from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_admin(user):
    """An authenticated, active user with the admin role (safe for AnonymousUser)."""
    return bool(user and user.is_authenticated and user.is_admin_role)


class IsAdminRole(BasePermission):
    message = "هذه العملية متاحة لمدير النظام فقط."

    def has_permission(self, request, view):
        return is_admin(request.user)


class LocationPermission(BasePermission):
    """
    Read: any authenticated user (or anonymous if PUBLIC_SEARCH_ENABLED).
    Write: admin and editor roles only. Enforced server-side.
    """

    message = "ليست لديك صلاحية لتنفيذ هذه العملية."

    def has_permission(self, request, view):
        user = request.user
        if request.method in SAFE_METHODS:
            if user and user.is_authenticated:
                return True
            return bool(getattr(settings, "PUBLIC_SEARCH_ENABLED", False))
        return bool(user and user.is_authenticated and user.can_edit_locations)
