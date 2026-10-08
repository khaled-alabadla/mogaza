# v2 step 1: add WaterZone and the new WaterSlot.zone FK (nullable while the data is migrated).
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("locations", "0002_location_neighborhood"),
        ("water", "0002_seed_neighborhoods"),
    ]

    operations = [
        migrations.CreateModel(
            name="WaterZone",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, verbose_name="اسم المنطقة")),
                ("code", models.CharField(blank=True, max_length=10, verbose_name="الرمز")),
                ("note", models.CharField(blank=True, max_length=300, verbose_name="ملاحظة")),
                ("sort_order", models.IntegerField(default=0, verbose_name="الترتيب")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="تاريخ الإضافة")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="آخر تعديل")),
                ("neighborhood", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="zones",
                                                   to="water.neighborhood", verbose_name="الحي")),
            ],
            options={
                "verbose_name": "منطقة مياه",
                "verbose_name_plural": "مناطق المياه",
                "ordering": ["neighborhood__sort_order", "neighborhood__name", "sort_order", "name"],
                "constraints": [models.UniqueConstraint(fields=("neighborhood", "name"),
                                                        name="waterzone_unique_name_per_neighborhood")],
            },
        ),
        migrations.AlterField(
            model_name="waterslot",
            name="location",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name="water_slots", to="locations.location", verbose_name="الموقع"),
        ),
        migrations.AddField(
            model_name="waterslot",
            name="zone",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="slots",
                                    to="water.waterzone", verbose_name="المنطقة"),
        ),
    ]
