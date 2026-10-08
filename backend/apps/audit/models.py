from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "CREATE", "إضافة"
        UPDATE = "UPDATE", "تعديل"
        DELETE = "DELETE", "حذف"
        RESTORE = "RESTORE", "استعادة"
        LOGIN = "LOGIN", "تسجيل دخول"
        LOGIN_FAILED = "LOGIN_FAILED", "محاولة دخول فاشلة"
        LOGOUT = "LOGOUT", "تسجيل خروج"
        IMPORT = "IMPORT", "استيراد بيانات"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="audit_logs", verbose_name="المستخدم")
    username = models.CharField("اسم المستخدم", max_length=150, blank=True)
    action = models.CharField("العملية", max_length=20, choices=Action.choices, db_index=True)
    entity_type = models.CharField("نوع السجل", max_length=30, blank=True, db_index=True)
    entity_id = models.CharField("رقم السجل", max_length=40, blank=True, db_index=True)
    entity_repr = models.CharField("وصف السجل", max_length=300, blank=True)
    before_data = models.JSONField("البيانات قبل", null=True, blank=True)
    after_data = models.JSONField("البيانات بعد", null=True, blank=True)
    ip_address = models.GenericIPAddressField("عنوان IP", null=True, blank=True)
    timestamp = models.DateTimeField("الوقت", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "سجل تدقيق"
        verbose_name_plural = "سجل التدقيق"
        ordering = ["-timestamp", "-id"]

    def __str__(self):
        return f"{self.timestamp:%Y-%m-%d %H:%M} {self.username} {self.action} {self.entity_repr}"
