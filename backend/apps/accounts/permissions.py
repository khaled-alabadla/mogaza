from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

# Read keys an anonymous visitor gets when PUBLIC_SEARCH_ENABLED (never complaints / inquiries).
PUBLIC_VIEW_KEYS = ("search.view", "water.view")
DENIED = "ليست لديك صلاحية لتنفيذ هذه العملية."


def is_admin(user):
    """An authenticated, active user with the admin role (safe for AnonymousUser)."""
    return bool(user and user.is_authenticated and user.is_admin_role)


def has_perm_key(user, key):
    """Whether a (possibly anonymous) user holds the permission key."""
    return bool(user and user.is_authenticated and user.has_perm_key(key))


class IsAdminRole(BasePermission):
    message = "هذه العملية متاحة لمدير النظام فقط."

    def has_permission(self, request, view):
        return is_admin(request.user)


class KeyPermission(BasePermission):
    """
    Read (GET/HEAD/OPTIONS): a user holding one of `view_keys`, or an anonymous visitor when
    PUBLIC_SEARCH_ENABLED and a view key is public (search / water). Write: a user holding `edit_key`.
    Enforced server-side; build one with `key_permission(...)`.
    """

    message = DENIED
    view_keys = ()
    edit_key = None

    def has_permission(self, request, view):
        user = request.user
        if request.method in SAFE_METHODS:
            if user and user.is_authenticated:
                return any(user.has_perm_key(key) for key in self.view_keys)
            return bool(getattr(settings, "PUBLIC_SEARCH_ENABLED", False)
                        and any(key in PUBLIC_VIEW_KEYS for key in self.view_keys))
        return has_perm_key(user, self.edit_key)


def key_permission(view_keys, edit_key):
    """A KeyPermission class for the given read key(s) (a key or a tuple: any of them) and write key."""
    if isinstance(view_keys, str):
        view_keys = (view_keys,)
    return type("KeyPermission", (KeyPermission,), {"view_keys": tuple(view_keys), "edit_key": edit_key})


# Locations, streets: the «البحث عن المواقع» page.
SearchPermission = key_permission("search.view", "search.edit")
# Water zones and the official distribution table: the «جدول المياه» page.
WaterPermission = key_permission("water.view", "water.edit")
# Water zones are also read by the locations page (a building's zone is picked there).
WaterZonePermission = key_permission(("water.view", "search.view"), "water.edit")
# Neighborhood committees' representatives: the «لجان الأحياء» page.
CommitteePermission = key_permission("committees.view", "committees.edit")
# Department circulars: the «تعميمات» page.
CircularPermission = key_permission("circulars.view", "circulars.edit")
# Neighborhoods: their names are read by every page (search filter, water table, complaints' «الحي»);
# editing them belongs to the locations page.
NeighborhoodPermission = key_permission(
    ("search.view", "water.view", "complaints.view", "inquiries.view"), "search.edit")
