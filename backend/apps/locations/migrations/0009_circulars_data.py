"""The department's first circular (it can be edited or deleted afterwards)."""
from django.db import migrations

TITLE = "أعمدة الكهرباء وقواعدها وإزالتها من الشوارع"
BODY = (
    "بخصوص استفسارات المواطنين عن أعمدة الكهرباء وقواعدها وإزالتها من الشوارع:\n"
    "يمكن توجيه المواطنين لمقر شركة الكهرباء الحالي: حي النصر، مقابل مستشفى مهدي.\n"
    "أو تزويدهم برقم جوال العلاقات العامة في شركة الكهرباء: 0595322040"
)


def add_circular(apps, schema_editor):
    from apps.locations.text import normalize_for_search

    Circular = apps.get_model("locations", "Circular")
    if not Circular.objects.exists():
        Circular.objects.create(title=TITLE, body=BODY, search_text=normalize_for_search(f"{TITLE} {BODY}"))


class Migration(migrations.Migration):
    dependencies = [("locations", "0008_circulars")]

    operations = [migrations.RunPython(add_circular, migrations.RunPython.noop)]
