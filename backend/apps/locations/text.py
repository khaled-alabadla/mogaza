"""Arabic-aware text helpers used for storage cleanup and search normalization."""
import re

_WHITESPACE = re.compile(r"\s+")
_INVISIBLE = re.compile(r"[\u200b\u2060\ufeff]")  # zero-width space, word joiner, BOM (not ZWNJ/ZWJ)
_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")  # tashkeel + tatweel
_CHAR_MAP = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ة": "ه",
    "ى": "ي", "ئ": "ي",
    "ؤ": "و",
    # Arabic-Indic and Eastern Arabic-Indic digits -> ASCII digits
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
})


def clean_text(value):
    """Trim and collapse internal whitespace, drop invisible zero-width characters. Keeps the rest as typed."""
    if value is None:
        return ""
    return _WHITESPACE.sub(" ", _INVISIBLE.sub("", str(value))).strip()


def normalize_for_search(value):
    """
    Fold common Arabic spelling variants so that e.g. "احمد" matches "أحمد",
    "مدرسه" matches "مدرسة" and "٩٥" matches "95". Used for both the stored
    search column and the incoming query.
    """
    text = clean_text(value)
    text = _DIACRITICS.sub("", text)
    text = text.translate(_CHAR_MAP)
    return text.lower()


def search_terms(query):
    return [term for term in normalize_for_search(query).split(" ") if term]


def name_key(value):
    """Comparison key for short names (e.g. neighborhoods): search-normalized, ignoring a stray hamza
    so that "مخيم الشاطيء" and "مخيم الشاطئ" are treated as the same name."""
    return normalize_for_search(value).replace("ء", "")


_DIGITS = str.maketrans({k: v for k, v in _CHAR_MAP.items() if v.isdigit()})


def ascii_digits(value):
    """Arabic-Indic digits → ASCII digits («٠٥٩٩» → «0599»), everything else unchanged."""
    return clean_text(value).translate(_DIGITS)
