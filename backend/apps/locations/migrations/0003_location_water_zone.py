import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("locations", "0002_location_neighborhood"),
        ("water", "0003_waterzone"),
    ]

    operations = [
        migrations.AddField(
            model_name="location",
            name="water_zone",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="locations", to="water.waterzone", verbose_name="منطقة المياه"),
        ),
    ]
