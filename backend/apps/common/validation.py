"""Small serializer-validation helpers shared by the apps (Arabic error messages)."""
from rest_framework import serializers

from apps.locations.text import clean_text


def required_text(value, label):
    """Whitespace-cleaned text; «<label> مطلوب.» when it is empty."""
    value = clean_text(value)
    if not value:
        raise serializers.ValidationError(f"{label} مطلوب.")
    return value


def exclude_instance(queryset, instance):
    """`queryset` without the object being edited (for uniqueness checks); unchanged on create."""
    return queryset.exclude(pk=instance.pk) if instance is not None else queryset
