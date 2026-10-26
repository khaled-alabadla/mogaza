"""The neighborhood committees' representatives as given by the department (they can be edited afterwards)."""
from django.db import migrations

REPS = [
    ("محمد جابر عبد العال", "لجنة حي الشجاعية", "0599419311"),
    ("ياسر محمد مصطفي البيك", "لجنة حي الشيخ رضوان", "0598897727"),
    ("ماهر محمد علي حرز الله", "لجنة حي الصبرة", "0599416262"),
    ("عادل الجزار", "لجنة حي المنارة", "0599613833"),
    ("عماد محمد علي حرز الله", "لجنة حي تل الهوى والرمال الجنوبي", "0595733033"),
    ("أدهم صبحي زيارة", "لجنة حي التفاح الشرقي", "0597188948"),
    ("نافذ نمر غزال", "لجنة حي التفاح الغربي", "0599303134"),
    ("سعيد راشد", "لجنة حي الدرج", "0597571248"),
    ("عزام نعيم دلول", "لجنة حي الزيتون", "0599879854"),
    ("سلامة عبد سلامة عطا الله", "لجنة حي الرمال", "0597519151"),
    ("نشأت أبو عميرة", "لجنة حي الشاطئ الشمالي والنصر الغربي", "0599302508"),
    ("محمد محمد ماضي", "لجنة حي الشاطئ الجنوبي", "0599464044"),
]


def add_reps(apps, schema_editor):
    from apps.locations.text import normalize_for_search

    CommitteeRep = apps.get_model("locations", "CommitteeRep")
    if CommitteeRep.objects.exists():
        return
    CommitteeRep.objects.bulk_create([
        CommitteeRep(name=name, committee=committee, phone=phone,
                     search_text=normalize_for_search(f"{name} {committee} {phone}"))
        for name, committee, phone in REPS
    ])


class Migration(migrations.Migration):
    dependencies = [("locations", "0006_committee_reps")]

    operations = [migrations.RunPython(add_reps, migrations.RunPython.noop)]
