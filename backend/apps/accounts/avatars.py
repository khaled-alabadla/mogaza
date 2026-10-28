"""
Profile pictures, without a table of their own: a small picture (resized in the browser to a 256 px
square, ~15–30 KB) is kept as a data URL in the existing «محتوى الموقع» table (SiteContent), under the key
«avatar:<user id>» — a key the developer dashboard cannot write (its keys can't contain «:») and the
public content list leaves out.

    PUT    /api/auth/avatar/            {"image": "data:image/webp;base64,…"}   the user's own picture
    DELETE /api/auth/avatar/                                                    removes it
    DELETE /api/users/<id>/avatar/      (administrator) removes someone's picture
    GET    /api/avatars/<id>/           the picture itself (signed-in users), cached by its «?v=» URL
"""
import base64
import binascii
import re

from django.contrib.auth import get_user_model
from django.http import Http404, HttpResponse
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.devpanel.models import SiteContent

from .permissions import IsAdminRole

User = get_user_model()

PREFIX = "avatar:"
MAX_BYTES = 150_000  # the picture itself; a 256 px square is far smaller
DATA_URL_RE = re.compile(r"^data:(image/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$")
# what each accepted type starts with (so a renamed file is refused)
SIGNATURES = {
    "image/png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}


def avatar_key(user_id):
    return f"{PREFIX}{user_id}"


def avatar_versions(user_ids=None):
    """{user id: version} of the users who have a picture (one query; the version changes with each upload)."""
    rows = SiteContent.objects.filter(key__startswith=PREFIX)
    if user_ids is not None:
        rows = rows.filter(key__in=[avatar_key(i) for i in user_ids])
    versions = {}
    for key, updated_at in rows.values_list("key", "updated_at"):
        try:
            versions[int(key[len(PREFIX):])] = int(updated_at.timestamp())
        except ValueError:
            continue
    return versions


def avatar_url(user_id, versions=None):
    """«/api/avatars/3/?v=1730000000», or None without a picture."""
    versions = avatar_versions([user_id]) if versions is None else versions
    version = versions.get(user_id)
    return f"/api/avatars/{user_id}/?v={version}" if version else None


def decode(data_url):
    """(content type, bytes) of an accepted picture; raises ValidationError otherwise."""
    match = DATA_URL_RE.match(data_url or "")
    if not match:
        raise serializers.ValidationError("الصورة يجب أن تكون بصيغة JPG أو PNG أو WebP.")
    content_type, payload = match.groups()
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise serializers.ValidationError("ملف الصورة غير صالح.")
    if len(raw) > MAX_BYTES:
        raise serializers.ValidationError("الصورة كبيرة جداً.")
    if not SIGNATURES[content_type](raw):
        raise serializers.ValidationError("ملف الصورة غير صالح.")
    return content_type, raw


class AvatarSerializer(serializers.Serializer):
    image = serializers.CharField(trim_whitespace=True, error_messages={"blank": "اختر صورة.", "required": "اختر صورة."})

    def validate_image(self, value):
        decode(value)
        return value


class MyAvatarView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = AvatarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        SiteContent.objects.update_or_create(key=avatar_key(request.user.pk),
                                             defaults={"value": serializer.validated_data["image"], "updated_by": request.user})
        log_action(AuditLog.Action.UPDATE, request=request, entity=request.user, after={"avatar": "changed"})
        return Response({"avatar": avatar_url(request.user.pk)})

    def delete(self, request):
        if SiteContent.objects.filter(key=avatar_key(request.user.pk)).delete()[0]:
            log_action(AuditLog.Action.UPDATE, request=request, entity=request.user, after={"avatar": "removed"})
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserAvatarView(APIView):
    """(administrator) remove a user's picture, e.g. one that isn't suitable."""

    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        user = User.objects.filter(pk=pk).first()
        # the hidden developer account doesn't exist for the other administrators
        if user is None or (user.is_superuser and not request.user.is_superuser):
            raise Http404
        if SiteContent.objects.filter(key=avatar_key(user.pk)).delete()[0]:
            log_action(AuditLog.Action.UPDATE, request=request, entity=user, after={"avatar": "removed"})
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvatarImageView(APIView):
    """The picture itself, for signed-in users only."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        row = SiteContent.objects.filter(key=avatar_key(pk)).first()
        owner = User.objects.filter(pk=pk).only("is_superuser").first()
        if row is None or owner is None or (owner.is_superuser and not request.user.is_superuser and request.user.pk != pk):
            raise Http404
        try:
            content_type, raw = decode(row.value)
        except serializers.ValidationError:
            raise Http404
        response = HttpResponse(raw, content_type=content_type)
        # the URL carries the version («?v=»): a new picture gets a new URL
        response["Cache-Control"] = "private, max-age=31536000, immutable"
        response["X-Content-Type-Options"] = "nosniff"
        return response
