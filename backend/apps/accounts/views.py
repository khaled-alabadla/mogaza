from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.db.models import Q
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.mixins import AuditedViewSetMixin
from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.common.params import text_param

from .permissions import IsAdminRole
from .serializers import ChangePasswordSerializer, CurrentUserSerializer, LoginSerializer, UserSerializer

User = get_user_model()

USER_AUDIT_FIELDS = ["username", "email", "first_name", "last_name", "role", "is_active"]


def user_snapshot(user):
    return {field: getattr(user, field) for field in USER_AUDIT_FIELDS}


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """Current session info. Also sets the CSRF cookie for the SPA."""

    permission_classes = [AllowAny]

    def get(self, request):
        user = CurrentUserSerializer(request.user).data if request.user.is_authenticated else None
        return Response({
            "user": user,
            "public_search": settings.PUBLIC_SEARCH_ENABLED,
            "csrf_token": get_token(request),
        })


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["username"]
        user = authenticate(request, username=identifier, password=serializer.validated_data["password"])
        if user is None:
            log_action(AuditLog.Action.LOGIN_FAILED, request=request, username=identifier[:150])
            return Response({"detail": "اسم المستخدم أو كلمة المرور غير صحيحة."},
                            status=status.HTTP_400_BAD_REQUEST)
        login(request, user)  # rotates the session key
        log_action(AuditLog.Action.LOGIN, request=request, user=user)
        return Response({"user": CurrentUserSerializer(user).data, "csrf_token": get_token(request)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        log_action(AuditLog.Action.LOGOUT, request=request)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    """Any logged-in user can change their own password (current password required)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        update_session_auth_hash(request, user)  # stay logged in
        log_action(AuditLog.Action.UPDATE, request=request, entity=user, after={"password_changed": True})
        return Response({"detail": "تم تغيير كلمة المرور بنجاح."})


SUPERUSER_PROTECTED = "لا يمكن تعديل حساب المدير الأعلى أو حذفه إلا من قِبله."


class UserViewSet(AuditedViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                  mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Admin-only user management: create, edit (role, active flag, password reset) and delete."""

    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = User.objects.all().order_by("username")
        search = text_param(self.request, "search")
        if search:
            qs = qs.filter(Q(username__icontains=search) | Q(first_name__icontains=search) |
                           Q(last_name__icontains=search) | Q(email__icontains=search))
        return qs

    def snapshot(self, instance):
        return user_snapshot(instance)

    def guard_superuser(self, target):
        """Only a superuser may edit, deactivate, reset the password of, or delete a superuser."""
        if target.is_superuser and not self.request.user.is_superuser:
            raise PermissionDenied(SUPERUSER_PROTECTED)

    def perform_update(self, serializer):
        self.guard_superuser(serializer.instance)
        before = user_snapshot(serializer.instance)
        password_changed = bool(serializer.validated_data.get("password"))
        user = serializer.save()
        if password_changed and user.pk == self.request.user.pk:
            update_session_auth_hash(self.request, user)  # an admin editing their own password stays logged in
        after = user_snapshot(user)
        if password_changed:
            after["password_reset"] = True
        self.audit(AuditLog.Action.UPDATE, user, before=before, after=after)

    def destroy(self, request, *args, **kwargs):
        """Permanently delete a user. Their past actions stay in the audit log (by username)."""
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response({"detail": "لا يمكنك حذف حسابك الخاص."}, status=status.HTTP_400_BAD_REQUEST)
        self.guard_superuser(user)
        self.perform_destroy(user)
        return Response(status=status.HTTP_204_NO_CONTENT)
