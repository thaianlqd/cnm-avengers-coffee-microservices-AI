"""Generic time syntax → intermediate TimeSpec → canonical warehouse scope."""

from __future__ import annotations
import calendar
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from services.analysis_contract import TimeSpec, TimeScope, TIME_SHAPES
from services.analysis_catalog import normalize, resolve_period


def shift_months(value, offset):
    index = value.year * 12 + value.month - 1 + offset
    year, month = index // 12, index % 12 + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def resolve_time(spec, reference_date, timezone):
    """Most recent occurrence whose start is not future; explicit years are exact."""
    spec = TimeSpec.model_validate(spec)
    required, optional = TIME_SHAPES[spec.kind]
    supplied = spec.model_dump(exclude_none=True)
    if any(supplied.get(field) is None for field in required):
        raise ValueError('incomplete time shape')
    assumptions = []
    if spec.kind == "relative":
        scope = TimeScope(mode=spec.mode, timezone=timezone)
        period = resolve_period(scope, reference_date)
        return scope, assumptions, period
    if spec.kind == "range":
        scope = TimeScope(
            mode="custom", start=spec.start, end=spec.end, timezone=timezone
        )
    elif spec.kind == "rolling":
        if not spec.amount or spec.unit not in ("day", "month"):
            raise ValueError("invalid rolling window")
        if spec.unit == "month" and spec.amount > 120:
            raise ValueError("rolling months exceed supported range")
        start = (
            reference_date - timedelta(days=spec.amount - 1)
            if spec.unit == "day"
            else shift_months(reference_date, -spec.amount) + timedelta(days=1)
        )
        scope = TimeScope(
            mode="custom", start=start, end=reference_date, timezone=timezone
        )
    else:
        if spec.kind == "year" and spec.year is None:
            raise ValueError("year required")
        month = (
            (spec.quarter - 1) * 3 + 1
            if spec.kind == "quarter"
            else 1 if spec.kind == "year" else spec.month
        )
        if month is None or (spec.kind == "day" and spec.day is None):
            raise ValueError("incomplete calendar date")
        day = spec.day if spec.kind == "day" else 1
        year = spec.year or reference_date.year
        start = None
        for _ in range(
            9
        ):  # accommodates a partial leap day without guessing an invalid date
            try:
                candidate = date(year, month, day)
            except ValueError:
                if spec.year:
                    raise
                year -= 1
                continue
            if spec.year or candidate <= reference_date:
                start = candidate
                break
            year -= 1
        if start is None:
            raise ValueError("invalid calendar date")
        width = {"month": 1, "quarter": 3, "year": 12}.get(spec.kind)
        end = shift_months(start, width) - timedelta(days=1) if width else start
        scope = TimeScope(mode="custom", start=start, end=end, timezone=timezone)
        if spec.year is None:
            label = {
                "month": f"Tháng {spec.month}",
                "quarter": f"Quý {spec.quarter}",
                "day": f"Ngày {spec.day}/{spec.month}",
            }[spec.kind]
            assumptions.append(
                f"Thời gian: {label} được hiểu là kỳ gần nhất đã xảy ra ({year})."
            )
    return scope, assumptions, resolve_period(scope, reference_date)


def parse_time(prompt, interpretation, timezone, reference_date=None):
    reference = reference_date or datetime.now(ZoneInfo(timezone)).date()
    if isinstance(reference, str):
        reference = date.fromisoformat(reference)
    text = normalize(prompt)
    parsed, occupied = [], []
    errors = []
    for item in interpretation.get("time_grammar", []):
        for match in re.finditer(item["pattern"], text):
            if any(match.start() < b and match.end() > a for a, b in occupied):
                continue
            occupied.append(match.span())
            parts = {k: int(v) for k, v in match.groupdict().items() if v is not None}
            try:
                parsed.append(
                    TimeSpec(
                        kind=item["kind"],
                        **parts,
                        **({"unit": item["unit"]} if item.get("unit") else {}),
                    )
                )
            except ValueError:
                errors.append("time_range_invalid")
    # Adjacent/answered year can qualify one partial date, without losing known fields.
    years = [p for p in parsed if p.kind == "year"]
    partial = [
        p for p in parsed if p.kind in ("day", "month", "quarter") and p.year is None
    ]
    if len(years) == len(partial) == 1:
        partial[0].year = years[0].year
        parsed.remove(years[0])
    # Two explicit day expressions form one ordered inclusive range.
    if len(parsed) == 2 and all(p.kind == "day" and p.year for p in parsed):
        try:
            parsed = [
                TimeSpec(
                    kind="range",
                    start=date(parsed[0].year, parsed[0].month, parsed[0].day),
                    end=date(parsed[1].year, parsed[1].month, parsed[1].day),
                )
            ]
        except ValueError:
            errors.append("time_range_invalid")
    relative = []
    for term, mode in interpretation["time_aliases"].items():
        for match in re.finditer(
            r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)", text
        ):
            if not any(match.start() < b and match.end() > a for a, b in occupied):
                relative.append({"term": term, "mode": mode})
    parsed += [TimeSpec(kind="relative", mode=item["mode"]) for item in relative]
    canonical, assumptions = [], []
    for part in parsed:
        try:
            scope, inferred, _ = resolve_time(part, reference, timezone)
            dump = scope.model_dump(mode="json")
            if dump not in canonical:
                canonical.append(dump)
            assumptions += inferred
        except (ValueError, TypeError, OverflowError):
            errors.append("time_range_invalid")
    if len(canonical) > 1:
        errors.append("time_range_ambiguous")
    forecast = any(
        re.search(r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)", text)
        for term in interpretation.get("forecast_terms", [])
    )
    if forecast:
        errors.append("forecast_unsupported")
    grains = list(
        dict.fromkeys(
            mode
            for term, mode in interpretation.get("granularity_aliases", {}).items()
            if re.search(r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)", text)
        )
    )
    if len(grains) > 1:
        errors.append("granularity_ambiguous")
    return {
        "reference_date": reference.isoformat(),
        "timezone": timezone,
        "recognized_time_parts": [
            p.model_dump(mode="json", exclude_none=True) for p in parsed
        ],
        "canonical_time": canonical[0] if len(canonical) == 1 and not errors else None,
        "explicit_time": [p for p in canonical if p["mode"] == "custom"],
        "time_terms": relative,
        "assumptions": list(dict.fromkeys(assumptions)),
        "time_errors": list(dict.fromkeys(errors)),
        "granularity": grains[0] if len(grains) == 1 else None,
        "time_spans": occupied,
    }
