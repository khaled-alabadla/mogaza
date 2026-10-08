"""Small serializer-validation helpers shared by the apps (Arabic error messages)."""
import re

from rest_framework import serializers

from apps.locations.text import clean_text

# Building / street numbers: digits and letters (e.g. "55F", "5A"), dashes, slashes, dots and spaces.
CODE_PATTERN = re.compile(r"^[\w\-/. ]*$")


def required_text(value, label):
    """Whitespace-cleaned text; «<label> مطلوب.» when it is empty."""
    value = clean_text(value)
    if not value:
        raise serializers.ValidationError(f"{label} مطلوب.")
    return value


def exclude_instance(queryset, instance):
    """`queryset` without the object being edited (for uniqueness checks); unchanged on create."""
    return queryset.exclude(pk=instance.pk) if instance is not None else queryset


def code_text(value, label):
    """Optional building/street-style number («55F», «5A»): cleaned, only letters, digits and - / . allowed."""
    value = clean_text(value)
    if value and not CODE_PATTERN.match(value):
        raise serializers.ValidationError(f"{label} يحتوي على رموز غير مسموحة.")
    return value
