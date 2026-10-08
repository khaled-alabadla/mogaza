from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class UsernameBackend(ModelBackend):
    """Authenticate by username only (case-insensitive)."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None
        User = get_user_model()
        user = User.objects.filter(username__iexact=username.strip()).first()
        if user is None:
            # Run the hasher anyway to reduce timing differences.
            User().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
