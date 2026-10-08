# v2 step 3: slots now belong only to zones.
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("water", "0004_build_zones_from_slots"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="waterslot",
            name="location",
        ),
        migrations.AlterField(
            model_name="waterslot",
            name="zone",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="slots",
                                    to="water.waterzone", verbose_name="المنطقة"),
        ),
        migrations.AddConstraint(
            model_name="waterslot",
            constraint=models.UniqueConstraint(fields=("zone", "day", "start_time", "end_time"),
                                               name="waterslot_unique_window"),
        ),
    ]
