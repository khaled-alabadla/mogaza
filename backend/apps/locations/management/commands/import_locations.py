"""
ONE-TIME / controlled import of the legacy Excel workbook into PostgreSQL.

    python manage.py import_locations path/to/source.xlsx [--dry-run]

The web application never calls this command and never reads Excel. After
the initial migration PostgreSQL is the only source of truth.

What it does:
  * opens the workbook read-only (the source file is never modified)
  * finds the worksheet + header row automatically by header text
    (التقاطع / المسمي العام / مبني / شارع), no hard-coded rows or columns
  * reads only real location records (formulas and the legacy J:K search
    helper are ignored)
  * also migrates the small "street common name -> official name" table
    (الشارع العام / الشارع الرسمي) so that no legacy data is lost
  * is idempotent: re-running it never creates extra copies, while
    legitimate duplicates inside the source are preserved
  * verifies every source record exists in the database afterwards
"""
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.audit.models import AuditLog
from apps.audit.services import log_action
from apps.locations.models import Location, StreetName
from apps.locations.text import clean_text, normalize_for_search

LOCATION_HEADERS = {
    "place_name": ["التقاطع", "اسم المكان", "المكان"],
    "description": ["المسمي العام", "المسمى العام", "الوصف"],
    "building_number": ["مبني", "مبنى", "رقم المبنى", "رقم المبني"],
    "street_number": ["شارع", "رقم الشارع"],
}
STREET_HEADERS = {
    "common_name": ["الشارع العام"],
    "official_name": ["الشارع الرسمي"],
}
MAX_HEADER_SCAN_ROWS = 50


def header_key(value):
    return normalize_for_search(value) if isinstance(value, str) else ""


def cell_to_text(value):
    """Convert a cell value to text without corrupting numbers (22.0 -> "22", "55F" stays "55F")."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return clean_text(value)


def is_formula(value):
    return isinstance(value, str) and value.startswith("=")


@dataclass
class TableSpec:
    header_row: int
    columns: dict  # field -> column index (1-based)


@dataclass
class Report:
    sheet: str = ""
    location_header_row: int = 0
    location_columns: dict = field(default_factory=dict)
    source_rows: list = field(default_factory=list)  # (row_number, record dict)
    street_rows: list = field(default_factory=list)
    skipped_formula_cells: int = 0
    skipped_empty_rows: int = 0
    skipped_notes: list = field(default_factory=list)
    rows_missing_name: list = field(default_factory=list)


def find_table(ws, header_map):
    """Return the header row and column index for each field, matched by header text."""
    wanted = {f: {header_key(h) for h in names} for f, names in header_map.items()}
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, MAX_HEADER_SCAN_ROWS)):
        columns = {}
        for cell in row:
            key = header_key(cell.value)
            if not key:
                continue
            for field_name, candidates in wanted.items():
                if field_name not in columns and key in candidates:
                    columns[field_name] = cell.column
                    break
        if len(columns) == len(header_map):
            return TableSpec(header_row=row[0].row, columns=columns)
    return None


def merged_cells_lookup(ws):
    cells = set()
    for rng in ws.merged_cells.ranges:
        for row in range(rng.min_row, rng.max_row + 1):
            for col in range(rng.min_col, rng.max_col + 1):
                cells.add((row, col))
    return cells


def read_table(ws, spec, report, merged, required_all=False):
    records = []
    for row_idx in range(spec.header_row + 1, ws.max_row + 1):
        record, has_value, merged_note = {}, False, False
        for field_name, col in spec.columns.items():
            value = ws.cell(row=row_idx, column=col).value
            if is_formula(value):
                report.skipped_formula_cells += 1
                value = None
            if value is not None and (row_idx, col) in merged and required_all:
                merged_note = True
            text = cell_to_text(value)
            record[field_name] = text
            has_value = has_value or bool(text)
        if not has_value:
            continue
        if merged_note:
            # Long guidance notes merged across the street columns - not street records.
            report.skipped_notes.append(row_idx)
            continue
        if required_all and not all(record.values()):
            report.skipped_notes.append(row_idx)
            continue
        records.append((row_idx, record))
    return records


def inspect_workbook(path):
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover
        raise CommandError("openpyxl is required for the import: pip install openpyxl") from exc

    # read_only=False is needed for merged-cell info; the file is only opened for reading, never saved.
    wb = load_workbook(filename=str(path), data_only=False)
    report = Report()
    for ws in wb.worksheets:
        spec = find_table(ws, LOCATION_HEADERS)
        if spec is None:
            continue
        merged = merged_cells_lookup(ws)
        report.sheet = ws.title
        report.location_header_row = spec.header_row
        report.location_columns = {f: ws.cell(row=spec.header_row, column=c).column_letter
                                   for f, c in spec.columns.items()}
        for row_idx, record in read_table(ws, spec, report, merged):
            if not record["place_name"]:
                report.rows_missing_name.append(row_idx)
                continue
            report.source_rows.append((row_idx, record))

        street_spec = find_table(ws, STREET_HEADERS)
        if street_spec is not None:
            report.street_rows = read_table(ws, street_spec, report, merged, required_all=True)
        break
    wb.close()
    if not report.sheet:
        raise CommandError("No worksheet contains the expected headers (التقاطع / المسمي العام / مبني / شارع).")
    return report


class Command(BaseCommand):
    help = "One-time import of legacy Excel location data into PostgreSQL (never used by the web app)."

    def add_arguments(self, parser):
        parser.add_argument("path", help="Path to the legacy .xlsx workbook")
        parser.add_argument("--dry-run", action="store_true", help="Inspect and report without writing")
        parser.add_argument("--skip-streets", action="store_true", help="Do not import the street-names table")

    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.is_file():
            raise CommandError(f"File not found: {path}")

        report = inspect_workbook(path)
        records = [r for _, r in report.source_rows]
        name_counts = Counter(normalize_for_search(r["place_name"]) for r in records)
        duplicate_names = {n: c for n, c in name_counts.items() if c > 1}
        exact_dupes = {k: c for k, c in Counter(tuple(r.values()) for r in records).items() if c > 1}

        w = self.stdout.write
        w(self.style.MIGRATE_HEADING("Workbook inspection"))
        w(f"  sheet:                     {report.sheet}")
        w(f"  header row:                {report.location_header_row}")
        w(f"  column mapping:            {report.location_columns}")
        if report.source_rows:
            w(f"  data rows:                 {report.source_rows[0][0]} .. {report.source_rows[-1][0]}")
        w(f"  location records:          {len(records)}")
        w(f"  rows without a name:       {len(report.rows_missing_name)} {report.rows_missing_name or ''}")
        w(f"  formula cells ignored:     {report.skipped_formula_cells} (legacy J:K helper not imported)")
        w(f"  missing description:       {sum(1 for r in records if not r['description'])}")
        w(f"  missing building number:   {sum(1 for r in records if not r['building_number'])}")
        w(f"  missing street number:     {sum(1 for r in records if not r['street_number'])}")
        w(f"  non-numeric building nos.: {[r['building_number'] for r in records if r['building_number'] and not r['building_number'].isdigit()]}")
        w(f"  duplicate names:           {len(duplicate_names)} {list(duplicate_names) or ''}")
        w(f"  exact duplicate records:   {len(exact_dupes)} (kept as-is)")
        if not options["skip_streets"]:
            w(f"  street-name pairs:         {len(report.street_rows)}")
            w(f"  merged note cells skipped: {report.skipped_notes}")

        if options["dry_run"]:
            w(self.style.WARNING("Dry run - nothing written."))
            return

        with transaction.atomic():
            loc_created = self._import(Location, records)
            street_records = [r for _, r in report.street_rows]
            street_created = 0 if options["skip_streets"] else self._import(StreetName, street_records)
            log_action(AuditLog.Action.IMPORT, entity_type="location", username="import_locations",
                       after={"source": path.name, "sheet": report.sheet, "locations_created": loc_created,
                              "streets_created": street_created})

        w(self.style.MIGRATE_HEADING("Import"))
        w(f"  locations created:         {loc_created} (already present: {len(records) - loc_created})")
        if not options["skip_streets"]:
            w(f"  street names created:      {street_created}")

        # Verification: every source record must be present in PostgreSQL at least as many times.
        missing = self._verify(Location, records)
        if not options["skip_streets"]:
            missing += self._verify(StreetName, [r for _, r in report.street_rows])
        w(self.style.MIGRATE_HEADING("Verification"))
        w(f"  source records:            {len(records)}")
        w(f"  active locations in DB:    {Location.active.count()}")
        if missing:
            for item in missing:
                self.stderr.write(f"  MISSING: {item}")
            raise CommandError(f"Verification failed: {len(missing)} record(s) missing.")
        w(self.style.SUCCESS("  All source records verified in PostgreSQL."))

    @staticmethod
    def _import(model, records):
        """Create only the copies that are not already present (idempotent, keeps real duplicates)."""
        wanted = Counter(tuple(sorted(r.items())) for r in records)
        created = 0
        for key, count in wanted.items():
            data = dict(key)
            existing = model.objects.filter(**data).count()
            for _ in range(max(0, count - existing)):
                model(**data).save()
                created += 1
        return created

    @staticmethod
    def _verify(model, records):
        wanted = Counter(tuple(sorted(r.items())) for r in records)
        missing = []
        for key, count in wanted.items():
            if model.objects.filter(**dict(key)).count() < count:
                missing.append(dict(key))
        return missing
