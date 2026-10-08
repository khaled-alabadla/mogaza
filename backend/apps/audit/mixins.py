from .models import AuditLog
from .services import log_action


class AuditedViewSetMixin:
    """
    DRF viewset mixin: every create / update / delete is audit-logged with the object's
    snapshot (before and/or after). Override `snapshot()` when the model has no `snapshot()`
    method, `save_kwargs()` to pass extra fields to `serializer.save()`, and set
    `audit_entity_type` to log under another name than the model name.
    """

    audit_entity_type = ""

    def snapshot(self, instance):
        return instance.snapshot()

    def save_kwargs(self, created):
        return {}

    def audit(self, action, instance, *, before=None, after=None):
        return log_action(action, request=self.request, entity=instance, entity_type=self.audit_entity_type,
                          before=before, after=after)

    def perform_create(self, serializer):
        instance = serializer.save(**self.save_kwargs(created=True))
        self.audit(AuditLog.Action.CREATE, instance, after=self.snapshot(instance))

    def perform_update(self, serializer):
        before = self.snapshot(serializer.instance)
        instance = serializer.save(**self.save_kwargs(created=False))
        self.audit(AuditLog.Action.UPDATE, instance, before=before, after=self.snapshot(instance))

    def perform_destroy(self, instance):
        self.audit(AuditLog.Action.DELETE, instance, before=self.snapshot(instance))
        instance.delete()
