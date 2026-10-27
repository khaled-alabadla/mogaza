"""
«الرئيسية»: what needs attention today, in one request.

    GET /api/home/     signed-in users

Each part is included only for a user holding its permission (absent otherwise):
    urgent      {"open": n, "oldest_days": d | None}                        urgent.view
    complaints  {"pending": n}                                              complaints.view
    inquiries   {"pending": n}                                              inquiries.view
    report      {"report_date": "YYYY-MM-DD", "updated_today": bool} | None  report.view
    water       {"today": i, "today_display": "...", "areas": [{"name", "source"}],
                 "tomorrow": {"day": i, "display": "...", "areas": [...]}}            water.view
    circulars   [{"id", "title", "pinned", "updated_at"}] (3: pinned first, then the latest)  circulars.view
Read only: no table of its own.
"""
from django.db.models import Count, Min, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import has_perm_key
from apps.complaints.models import Complaint, DailyReport, UrgentComplaint
from apps.locations.models import Circular
from apps.water.models import DAY_LABELS, DistributionArea, today_info

CIRCULARS_SHOWN = 3


def urgent_summary():
    open_ = UrgentComplaint.objects.filter(is_active=True, status=UrgentComplaint.Status.UNRESOLVED)
    stats = open_.aggregate(n=Count("id"), oldest=Min("submitted_on"))
    oldest = stats["oldest"]
    return {"open": stats["n"], "oldest_days": (timezone.localdate() - oldest).days if oldest else None}


def pending_counts():
    """{"complaint": n, "inquiry": n}: records not yet entered into the main system."""
    counts = Complaint.objects.filter(is_active=True, status=Complaint.Status.PENDING).aggregate(
        complaint=Count("id", filter=Q(kind=Complaint.Kind.COMPLAINT)),
        inquiry=Count("id", filter=Q(kind=Complaint.Kind.INQUIRY)),
    )
    return counts


def report_summary():
    report = DailyReport.objects.filter(pk=1).only("report_date", "updated_at").first()
    if report is None:
        return None
    return {"report_date": report.report_date.isoformat(),
            "updated_today": timezone.localdate(report.updated_at) == timezone.localdate()}


def areas_on(day):
    """The areas served on a weekday (0 = Saturday), each once (an area may be listed in two rows)."""
    seen, areas = set(), []
    rows = (DistributionArea.objects.filter(group__days__contains=[day])
            .order_by("group__sort_order", "group_id", "sort_order").values_list("name", "source"))
    for name, source in rows:
        if name not in seen:
            seen.add(name)
            areas.append({"name": name, "source": source})
    return areas


def water_today():
    """Today's areas, and tomorrow's (the evening calls ask about tomorrow)."""
    info = today_info()
    tomorrow = (info["today"] + 1) % 7
    return {**info, "areas": areas_on(info["today"]),
            "tomorrow": {"day": tomorrow, "display": DAY_LABELS[tomorrow], "areas": areas_on(tomorrow)}}


def latest_circulars():
    rows = (Circular.objects.filter(is_active=True).order_by("-pinned", "-updated_at", "-id")
            .values("id", "title", "pinned", "updated_at")[:CIRCULARS_SHOWN])
    return list(rows)


class HomeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = {}
        if has_perm_key(user, "urgent.view"):
            data["urgent"] = urgent_summary()
        wants_complaints = has_perm_key(user, "complaints.view")
        wants_inquiries = has_perm_key(user, "inquiries.view")
        if wants_complaints or wants_inquiries:
            pending = pending_counts()
            if wants_complaints:
                data["complaints"] = {"pending": pending["complaint"]}
            if wants_inquiries:
                data["inquiries"] = {"pending": pending["inquiry"]}
        if has_perm_key(user, "report.view"):
            data["report"] = report_summary()
        if has_perm_key(user, "water.view"):
            data["water"] = water_today()
        if has_perm_key(user, "circulars.view"):
            data["circulars"] = latest_circulars()
        return Response(data)
