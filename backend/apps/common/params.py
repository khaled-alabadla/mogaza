"""Query-string parsing shared by the API views. Invalid filter values are ignored, never an error."""

TRUE_VALUES = {"1", "true", "yes"}


def text_param(request, name):
    """A stripped text query parameter ("" when absent). NUL characters, which PostgreSQL rejects, are dropped."""
    return request.query_params.get(name, "").replace("\x00", "").strip()


def int_param(request, name, min_value=None, max_value=None):
    """An integer query parameter, or None when absent/invalid/out of range."""
    raw = text_param(request, name)
    if not raw.isdecimal():  # not isdigit(): "²" is a digit that int() rejects
        return None
    value = int(raw)
    if (min_value is not None and value < min_value) or (max_value is not None and value > max_value):
        return None
    return value


def bool_param(request, name):
    """True only for an explicit "1", "true" or "yes"."""
    return request.query_params.get(name) in TRUE_VALUES
