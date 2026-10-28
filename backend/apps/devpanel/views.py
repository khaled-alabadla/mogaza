"""
The developer dashboard («/dashboard»): hidden from everyone, opened with a one-time code e-mailed to
settings.DEVELOPER_EMAIL, and logged in as the developer's (superuser) account.

    GET            /api/content/                     every edited text {key: value}   (public: the site uses it)
    POST           /api/dev/otp/request/             {"email"} → e-mails a 6-digit code (same answer for any e-mail)
    POST           /api/dev/otp/verify/              {"email", "code"} → logs the developer in
    PUT / DELETE   /api/dev/content/{key}/           {"value"} → save / back to the site's default (developer only)
"""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.core.mail import send_mail
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.serializers import CurrentUserSerializer
from apps.audit.models import AuditLog
from apps.audit.services import log_action

from .models import DevLoginCode, SiteContent

User = get_user_model()

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
MAX_VALUE_BYTES = 300_000  # «دليل القسم» is the largest block (~40 KB)
KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,99}$")
SENT = "إذا كان البريد هو بريد المطوّر فقد أُرسل إليه رمز الدخول."
BAD_CODE = "الرمز غير صحيح أو انتهت صلاحيته."


def code_hash(email, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{email.lower()}:{code}".encode(), hashlib.sha256).hexdigest()


def is_developer_email(email):
    return bool(settings.DEVELOPER_EMAIL) and email.strip().lower() == settings.DEVELOPER_EMAIL.strip().lower()


def developer_account(email):
    """The superuser to log in: the one with this e-mail, else the first active superuser."""
    superusers = User.objects.filter(is_superuser=True, is_active=True).order_by("pk")
    return superusers.filter(email__iexact=email).first() or superusers.first()


class IsDeveloper(BasePermission):
    message = "هذه الصفحة غير متاحة."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField(error_messages={"invalid": "أدخل بريداً إلكترونياً صحيحاً.",
                                                   "required": "أدخل البريد الإلكتروني.",
                                                   "blank": "أدخل البريد الإلكتروني."})


class VerifySerializer(EmailSerializer):
    code = serializers.RegexField(r"^\d{6}$", error_messages={"invalid": "الرمز 6 أرقام.", "required": "أدخل الرمز.",
                                                               "blank": "أدخل الرمز."})


class OtpRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].strip().lower()
        # Any other address gets the same answer, so the developer's e-mail can't be guessed from here.
        if is_developer_email(email) and developer_account(email):
            DevLoginCode.objects.filter(email=email, used_at__isnull=True).update(used_at=timezone.now())
            code = f"{secrets.randbelow(10**6):06d}"
            DevLoginCode.objects.create(email=email, code_hash=code_hash(email, code),
                                        expires_at=timezone.now() + CODE_TTL)
            send_mail(
                subject=f"رمز دخول لوحة التحكم: {code}",
                message=(f"رمز الدخول إلى لوحة تحكم «قسم المعلومات والشكاوي» هو:\n\n{code}\n\n"
                         "صالح لمدة 10 دقائق ولمرة واحدة. إذا لم تطلبه فتجاهل هذه الرسالة."),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
            )
        return Response({"detail": SENT})


class OtpVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        data = VerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].strip().lower()
        entry = DevLoginCode.objects.filter(email=email, used_at__isnull=True,
                                            expires_at__gt=timezone.now()).first()
        if entry is None or entry.attempts >= MAX_ATTEMPTS:
            return Response({"detail": BAD_CODE}, status=status.HTTP_400_BAD_REQUEST)
        if not hmac.compare_digest(entry.code_hash, code_hash(email, data.validated_data["code"])):
            entry.attempts += 1
            entry.save(update_fields=["attempts"])
            return Response({"detail": BAD_CODE}, status=status.HTTP_400_BAD_REQUEST)
        user = developer_account(email)
        if user is None:
            return Response({"detail": BAD_CODE}, status=status.HTTP_400_BAD_REQUEST)
        entry.used_at = timezone.now()
        entry.save(update_fields=["used_at"])
        login(request, user, backend="apps.accounts.backends.UsernameBackend")
        log_action(AuditLog.Action.LOGIN, request=request, user=user)
        return Response({"user": CurrentUserSerializer(user).data, "csrf_token": get_token(request)})


class ContentView(APIView):
    """Every text edited from the dashboard; the site falls back to its own text for the others."""

    permission_classes = [AllowAny]

    def get(self, request):
        # profile pictures live in the same table («avatar:<id>»): never in this public list
        return Response({row.key: row.value for row in SiteContent.objects.exclude(key__startswith="avatar:")})


class ContentItemView(APIView):
    permission_classes = [IsDeveloper]

    def put(self, request, key):
        if not KEY_RE.match(key):
            return Response({"detail": "مفتاح غير صالح."}, status=status.HTTP_400_BAD_REQUEST)
        if "value" not in request.data:
            return Response({"value": ["القيمة مطلوبة."]}, status=status.HTTP_400_BAD_REQUEST)
        value = request.data["value"]
        if len(request.body) > MAX_VALUE_BYTES:
            return Response({"value": ["المحتوى أكبر من المسموح."]}, status=status.HTTP_400_BAD_REQUEST)
        row, _ = SiteContent.objects.update_or_create(key=key, defaults={"value": value, "updated_by": request.user})
        log_action(AuditLog.Action.UPDATE, request=request, entity_type="sitecontent", after={"key": key})
        return Response({"key": row.key, "value": row.value})

    def delete(self, request, key):
        SiteContent.objects.filter(key=key).delete()
        log_action(AuditLog.Action.DELETE, request=request, entity_type="sitecontent", after={"key": key})
        return Response(status=status.HTTP_204_NO_CONTENT)
