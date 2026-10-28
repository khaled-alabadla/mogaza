from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.common.validation import exclude_instance

from .models import PERMISSION_KEYS, ordered_permissions

User = get_user_model()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True,
                                     error_messages={"blank": "يرجى إدخال اسم المستخدم.",
                                                     "required": "يرجى إدخال اسم المستخدم."})
    password = serializers.CharField(max_length=128, trim_whitespace=False,
                                     error_messages={"blank": "يرجى إدخال كلمة المرور.",
                                                     "required": "يرجى إدخال كلمة المرور."})


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False,
                                             error_messages={"blank": "يرجى إدخال كلمة المرور الحالية.",
                                                             "required": "يرجى إدخال كلمة المرور الحالية."})
    new_password = serializers.CharField(trim_whitespace=False,
                                         error_messages={"blank": "يرجى إدخال كلمة المرور الجديدة.",
                                                         "required": "يرجى إدخال كلمة المرور الجديدة."})

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("كلمة المرور الحالية غير صحيحة.")
        return value

    def validate_new_password(self, value):
        try:
            validate_password(value, user=self.context["request"].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


class ProfileSerializer(serializers.ModelSerializer):
    """
    «الملف الشخصي»: what a user may change on their own account (name, e-mail, username). A new username
    needs the current password (it is what they sign in with). Role and permissions stay the admin's.
    """

    current_password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name", "current_password"]
        extra_kwargs = {
            "username": {"required": False, "error_messages": {"blank": "يرجى إدخال اسم المستخدم."}},
            "email": {"required": False, "allow_blank": True},
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }

    def validate_username(self, value):
        value = value.strip()
        if exclude_instance(User.objects.filter(username__iexact=value), self.instance).exists():
            raise serializers.ValidationError("اسم المستخدم مستخدم مسبقاً.")
        return value

    def validate_email(self, value):
        value = (value or "").strip()
        if value and exclude_instance(User.objects.filter(email__iexact=value), self.instance).exists():
            raise serializers.ValidationError("البريد الإلكتروني مستخدم مسبقاً.")
        return value

    def validate(self, attrs):
        password = attrs.pop("current_password", "")
        new_username = attrs.get("username")
        if new_username is not None and new_username.lower() != self.instance.username.lower():
            if not password:
                raise serializers.ValidationError({"current_password": "أدخل كلمة المرور الحالية لتغيير اسم المستخدم."})
            if not self.instance.check_password(password):
                raise serializers.ValidationError({"current_password": "كلمة المرور الحالية غير صحيحة."})
        for field in ("first_name", "last_name"):
            if field in attrs:
                attrs[field] = attrs[field].strip()
        return attrs


class CurrentUserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    # kept for older clients: = the «search.edit» permission
    can_edit = serializers.BooleanField(source="can_edit_locations", read_only=True)
    is_admin = serializers.BooleanField(source="is_admin_role", read_only=True)
    permissions = serializers.ListField(source="effective_permissions", read_only=True)
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "role_display",
                  "can_edit", "is_admin", "is_superuser", "permissions", "avatar"]

    def get_avatar(self, obj):
        from .avatars import avatar_url
        return avatar_url(obj.pk)


class PermissionListField(serializers.Field):
    """
    Write: a list of keys from the catalog (deduplicated, stored in catalog order), or null for the
    role's defaults. Read: the user's effective permissions.
    """

    default_error_messages = {
        "not_a_list": "الصلاحيات يجب أن تكون قائمة.",
        "unknown": "صلاحية غير معروفة: {value}.",
    }

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_null", True)
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        return instance.effective_permissions

    def to_representation(self, value):
        return list(value)

    def to_internal_value(self, data):
        if not isinstance(data, list):
            self.fail("not_a_list")
        for key in data:
            if not isinstance(key, str) or key not in PERMISSION_KEYS:
                self.fail("unknown", value=str(key)[:50])
        return ordered_permissions(data)


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False,
                                     trim_whitespace=False, style={"input_type": "password"})
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    permissions = PermissionListField()
    # whether `permissions` are the role's defaults (never customized)
    uses_role_defaults = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "role_display",
                  "is_active", "is_superuser", "last_login", "date_joined", "password", "permissions",
                  "uses_role_defaults", "avatar"]
        read_only_fields = ["id", "is_superuser", "last_login", "date_joined"]
        extra_kwargs = {"email": {"required": False, "allow_blank": True}}

    def get_uses_role_defaults(self, obj):
        return obj.permissions is None

    def get_avatar(self, obj):
        # the list passes every picture's version at once («avatar_versions» in the context)
        from .avatars import avatar_url
        return avatar_url(obj.pk, self.context.get("avatar_versions"))

    def validate_username(self, value):
        value = value.strip()
        if exclude_instance(User.objects.filter(username__iexact=value), self.instance).exists():
            raise serializers.ValidationError("اسم المستخدم مستخدم مسبقاً.")
        return value

    def validate_email(self, value):
        value = (value or "").strip()
        if value:
            if exclude_instance(User.objects.filter(email__iexact=value), self.instance).exists():
                raise serializers.ValidationError("البريد الإلكتروني مستخدم مسبقاً.")
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        if self.instance is None and not password:
            raise serializers.ValidationError({"password": "كلمة المرور مطلوبة عند إنشاء مستخدم."})
        if password:
            candidate = self.instance or User(username=attrs.get("username", ""), email=attrs.get("email", ""))
            try:
                validate_password(password, user=candidate)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": list(exc.messages)})

        request = self.context.get("request")
        if self.instance is not None and request and self.instance.pk == request.user.pk:
            if attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "لا يمكنك تعطيل حسابك الخاص."})
            if "role" in attrs and attrs["role"] != User.Role.ADMIN:
                raise serializers.ValidationError({"role": "لا يمكنك إزالة صلاحية المدير عن حسابك الخاص."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
