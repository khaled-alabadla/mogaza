from django.db import migrations

# Gaza City neighborhoods, in the order of the municipality map (sort_order = position).
NEIGHBORHOODS = [
    "المرابطين", "مدينة العودة", "البلاخية", "مخيم الشاطئ", "النصر", "الشيخ رضوان", "الرمال الشمالي",
    "الرمال الجنوبي", "الدرج", "التفاح", "الصبرة", "البلدة القديمة", "الشيخ عجلين", "تل الهوى", "اجديدة",
    "اجديدة الشرقية", "التركمان", "التركمان الشرقي", "الزيتون", "توسعة النفوذ غرب صلاح الدين",
    "توسعة النفوذ شرق صلاح الدين",
]


def seed(apps, schema_editor):
    Neighborhood = apps.get_model("water", "Neighborhood")
    for index, name in enumerate(NEIGHBORHOODS, start=1):
        Neighborhood.objects.get_or_create(name=name, defaults={"sort_order": index})


def unseed(apps, schema_editor):
    Neighborhood = apps.get_model("water", "Neighborhood")
    Neighborhood.objects.filter(name__in=NEIGHBORHOODS, locations__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("water", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
