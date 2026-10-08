from .models import AuditLog


def client_ip(request):
    if request is None:
        return None
    # Only REMOTE_ADDR is trusted; configure the reverse proxy to set it correctly.
    return request.META.get("REMOTE_ADDR") or None


def log_action(action, *, request=None, user=None, entity=None, entity_type="", before=None, after=None,
               username=None):
    """Record an audit event. `entity` may be any model instance with a pk."""
    if user is None and request is not None and getattr(request, "user", None) is not None:
        user = request.user if request.user.is_authenticated else None
    if entity is not None:
        entity_type = entity_type or entity._meta.model_name
    return AuditLog.objects.create(
        user=user,
        username=username if username is not None else (user.get_username() if user else ""),
        action=action,
        entity_type=entity_type,
        entity_id=str(entity.pk) if entity is not None else "",
        entity_repr=str(entity)[:300] if entity is not None else "",
        before_data=before,
        after_data=after,
        ip_address=client_ip(request),
    )
