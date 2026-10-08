"""
Seed «جدول توزيع المياه حسب توجيهات المواطنين» from the official paper sheet
(printed rows + handwritten additions; «البلدة القديمة» was struck out of the Mon/Fri row
and handwritten into the Sun/Thu row). Days: 0=السبت … 6=الجمعة.
"""
from django.db import migrations

TABLE = [
    ([0, 3], [  # السبت / الثلاثاء
        "النديم", "عين جالوت", "الزيتون مربع سلمي", "نادي الزيتون",
        "البساتين", "الدهشان", "عسقولة", "مسجد التوحيد", "شارع حميد غربا",
        "معسكر بلوك1", "الحسانية",
        "الصبرة", "مسجد النور", "مدرسة صفد",
    ]),
    ([2, 6], [  # الاثنين / الجمعة
        "الدرج", "السدرة", "مدرسة موسى بن نصير", "السامر",
        "ش 8 الراهبات", "ش الكلية", "مفترق التايلاندي وبالميرا", "المطبخ الشرقي",
        "الخدمة العامة", "هولست", "منطقة البكري", "مسجد الصحابة", "البندر",
        "ساحة الشوا", "مدرسة فهمي الجرجاوي", "الايبكي", "النفق صيدلية الاسرة",
        "دوار الدحدوح",
    ]),
    ([1, 5], [  # الأحد / الخميس
        "الشيخ رضوان ش شارع الجسر", "عصام الصرطاوي", "الشارع الثاني", "البلدة القديمة",
        "تل الهوا مسجد الامباشي", "دوار أبو مازن", "مجلس الوزراء", "النفق الشرقي",
        "مدرسة رقية", "دوار 17", "الشاليهات مسجد الرضوان", "شارع القاهرة",
        "قهوة الجلاء", "سوق الزاوية", "حديقة الجرين", "المكفوفين",
    ]),
    ([0, 4], [  # السبت / الأربعاء
        "الثلاثيني شركة الكهرباء", "مسجد الزاوية", "سرايا", "الشفا", "أبو خضرة",
        "الصبرة", "عمو عماد", "مسجد بلال", "المغربي", "ش المؤسسات الشئون المدنية",
        "الوقائي شارع ريم رياشي", "الجامعات مفترق الازهر", "دوار حيدر",
        "مستشفى القدس غربا", "نادي الوحدة", "قصر رغدان", "دوار الخور", "مفترق الاحرار",
    ]),
    ([1, 3], [  # الأحد / الثلاثاء
        "شارع اليرموك", "تاج مول 4", "برشلونة", "وزارة العمل",
    ]),
]


def seed(apps, schema_editor):
    Group = apps.get_model("water", "DistributionGroup")
    Area = apps.get_model("water", "DistributionArea")
    if Group.objects.exists():
        return
    for order, (days, areas) in enumerate(TABLE, start=1):
        group = Group.objects.create(days=days, sort_order=order)
        Area.objects.bulk_create([Area(group=group, name=name, sort_order=i) for i, name in enumerate(areas)])


def unseed(apps, schema_editor):
    apps.get_model("water", "DistributionGroup").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("water", "0006_distribution_table")]
    operations = [migrations.RunPython(seed, unseed)]
