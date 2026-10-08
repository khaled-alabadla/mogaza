from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.common.validation import exclude_instance

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


class CurrentUserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    can_edit = serializers.BooleanField(source="can_edit_locations", read_only=True)
    is_admin = serializers.BooleanField(source="is_admin_role", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "role_display",
                  "can_edit", "is_admin", "is_superuser"]


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False,
                                     trim_whitespace=False, style={"input_type": "password"})
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "role_display",
                  "is_active", "is_superuser", "last_login", "date_joined", "password"]
        read_only_fields = ["id", "is_superuser", "last_login", "date_joined"]
        extra_kwargs = {"email": {"required": False, "allow_blank": True}}

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
