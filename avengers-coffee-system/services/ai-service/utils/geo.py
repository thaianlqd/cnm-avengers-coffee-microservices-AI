import os
import math
import httpx
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional, Tuple

logger = logging.getLogger(__name__)
# httpx INFO records include the complete request URL and its apikey query
# parameter. Provider calls are logged below without URL or credentials.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def _fold_location(value: str) -> str:
    raw = unicodedata.normalize('NFD', str(value or '').lower()).replace('đ', 'd')
    return re.sub(r'\s+', ' ', ''.join(c for c in raw if unicodedata.category(c) != 'Mn')).strip()


def _locality_parts(address: str) -> list[str]:
    parts = [part.strip() for part in address.split(',') if part.strip()]
    if parts and re.match(r'^(?:[a-z]{1,3}\d+|\d+[a-z]?)(?:[/.-]\d+[a-z]?)?\s', _fold_location(parts[0])):
        parts = parts[1:]
    result = []
    for part in parts:
        folded = _fold_location(part)
        folded = re.sub(r'^(?:phuong|quan|huyen|xa|tinh|thanh pho|tp|p|q|h)\.?\s+', '', folded)
        folded = re.sub(r'\bhcm\b', 'ho chi minh', folded)
        if folded:
            result.append(folded)
    return result


def _matches_locality(requested: list[str], candidate: dict, place: dict) -> bool:
    fields = ('display', 'address', 'name', 'city', 'district', 'ward', 'province', 'formatted_address')
    from src.agents.location_parser import locality_matches
    components = [str(source.get(key) or '') for source in (candidate, place) for key in fields]
    place_admin = [str(place.get(key) or '') for key in ('district', 'ward', 'city', 'province') if place.get(key)]
    if len(requested) == 1 and place_admin and not any(
        locality_matches(component, requested[0]) for component in place_admin
    ):
        # Search suggestions can be mislabeled. The resolved place's
        # administrative fields take precedence over its search snippet.
        return False
    return bool(components) and all(
        any(locality_matches(component, part) for component in components)
        for part in requested
    )


@dataclass(frozen=True)
class LocationResolution:
    status: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    match_type: Optional[str] = None
    normalized_label: Optional[str] = None
    administrative_components: Optional[dict] = None
    provider_candidate_count: int = 0
    rejected_candidate_count: int = 0
    resolution_basis: Optional[str] = None
    candidate_error_count: int = 0
    candidates: Tuple[dict, ...] = ()
    provider_ref_id: Optional[str] = None


_ADMIN_PREFIX = re.compile(
    r"^(?P<level>phuong|xa|quan|huyen|tinh|thanh pho|tp|p|q|h)\.?\s+",
    re.IGNORECASE,
)
_LEVEL_ALIASES = {"p": "phuong", "q": "quan", "h": "huyen", "tp": "thanh pho"}


def _admin_identity(value: str) -> tuple[Optional[str], str]:
    folded = re.sub(r"[^a-z0-9\s]", " ", _fold_location(value))
    folded = re.sub(r"\s+", " ", folded).strip()
    match = _ADMIN_PREFIX.match(folded)
    if not match:
        return None, folded
    return _LEVEL_ALIASES.get(match.group("level"), match.group("level")), folded[match.end():].strip()


def _initialism(value: str) -> str:
    return "".join(token[0] for token in re.findall(r"[a-z0-9]+", value) if token)


def _name_equivalent(requested: str, canonical: str) -> bool:
    _, requested_name = _admin_identity(requested)
    _, canonical_name = _admin_identity(canonical)
    if not requested_name or not canonical_name:
        return False
    if requested_name == canonical_name:
        return True
    compact = requested_name.replace(" ", "")
    return len(compact) >= 2 and compact.isalnum() and compact == _initialism(canonical_name)


def _admin_fields(place: dict) -> dict[str, list[str]]:
    return {
        "ward": [str(place.get(key) or "") for key in ("ward", "commune") if place.get(key)],
        "district": [str(place.get(key) or "") for key in ("district",) if place.get(key)],
        "city": [str(place.get(key) or "") for key in ("city", "province") if place.get(key)],
    }


def _admin_constraints(query: str, admin_hints: tuple[str, ...] = ()) -> dict[str, tuple[str, ...]]:
    """Return explicit administrative constraints grouped by semantic level."""
    source = list(admin_hints) or [part.strip() for part in str(query or "").split(",")]
    constraints: dict[str, list[str]] = {"ward": [], "district": [], "city": []}
    for component in source:
        level, name = _admin_identity(component)
        if not name:
            continue
        field = (
            "ward" if level in {"phuong", "xa"} else
            "district" if level in {"quan", "huyen"} else
            "city" if level in {"thanh pho", "tinh"} else
            None
        )
        if field and component not in constraints[field]:
            constraints[field].append(component)
    return {field: tuple(values) for field, values in constraints.items() if values}


def _admin_constraints_match(constraints: dict[str, tuple[str, ...]], place: dict) -> bool:
    """Require place-detail evidence for every explicit admin component."""
    fields = _admin_fields(place)
    return all(
        any(_name_equivalent(requested, candidate) for candidate in fields.get(field, []))
        for field, requested_values in constraints.items()
        for requested in requested_values
    )


def _admin_hint_matches(hint: str, place: dict) -> bool:
    level, _ = _admin_identity(hint)
    fields = _admin_fields(place)
    if level in {"phuong", "xa"}:
        candidates = fields["ward"]
    elif level in {"quan", "huyen"}:
        candidates = fields["district"]
    elif level in {"thanh pho", "tinh"}:
        candidates = fields["city"]
    else:
        candidates = [value for values in fields.values() for value in values]
    return any(_name_equivalent(hint, candidate) for candidate in candidates)


def _poi_core(query: str) -> str:
    value = re.sub(
        r"(?:,|\s)\s*(?:thành\s+phố|tỉnh|quận|huyện|phường|xã|tp\.?|q\.?|h\.?|p\.?)\s+[^,]+$",
        "", str(query or "").strip(), flags=re.IGNORECASE,
    )
    return re.sub(r"^(?:(?:tôi|mình)(?:\s+đang)?\s+ở|ở|tại|gần)\s+", "", value, flags=re.IGNORECASE).strip(" ,")


def _poi_name_matches(query: str, candidate: dict, place: dict) -> bool:
    requested = re.sub(r"[^a-z0-9\s]", " ", _fold_location(_poi_core(query)))
    requested = re.sub(r"\s+", " ", requested).strip()
    if len(requested) < 4:
        return False
    names = [str(source.get(key) or "") for source in (place, candidate)
             for key in ("name", "display") if source.get(key)]
    for name in names:
        folded = re.sub(r"[^a-z0-9\s]", " ", _fold_location(name))
        folded = re.sub(r"\s+", " ", folded).strip()
        if requested == folded or requested in folded:
            return True
        requested_tokens = set(requested.split())
        candidate_tokens = set(folded.split())
        if len(requested_tokens) >= 3 and requested_tokens <= candidate_tokens:
            return True
    return False


def _address_matches(query: str, candidate: dict, place: dict) -> bool:
    parts = [part.strip() for part in str(query or "").split(",") if part.strip()]
    if not parts:
        return False
    house_pattern = re.compile(r"^((?:[A-Za-z]{1,3}\d{1,5}|\d{1,5}[A-Za-z]?)(?:[/.-]\d{1,5}[A-Za-z]?)?)\s+", re.IGNORECASE)
    requested_house = house_pattern.match(parts[0])
    street = house_pattern.sub("", parts[0]).strip()
    street_folded = _fold_location(street)
    street_sources = " ".join(str(source.get(key) or "") for source in (place, candidate)
                              for key in ("street", "address", "formatted_address", "display", "name"))
    if not street_folded or street_folded not in _fold_location(street_sources):
        return False
    if requested_house:
        # Search snippets can echo the query even when place detail disagrees,
        # so exact-address confidence comes only from resolved place evidence.
        provider_houses = []
        for key in ("house_number", "address", "formatted_address", "display", "name"):
            value = str(place.get(key) or "").strip()
            match = house_pattern.match(value)
            if match:
                provider_houses.append(match.group(1))
        normalize_house = lambda value: re.sub(r"[^0-9a-z/.-]", "", _fold_location(value))
        requested_number = normalize_house(requested_house.group(1))
        provider_norm = {normalize_house(value) for value in provider_houses}
        if not provider_houses:
            return False
        if requested_number not in provider_norm:
            requested_base = requested_number.split('/')[0] if '/' in requested_number else None
            if not requested_base or requested_base not in provider_norm:
                return False
    admin_values = [value for values in _admin_fields(place).values() for value in values]
    for component in parts[1:]:
        if not any(_name_equivalent(component, canonical) for canonical in admin_values):
            return False
    return True


def _label(candidate: dict, place: dict) -> Optional[str]:
    for source in (place, candidate):
        for key in ("display", "formatted_address", "name", "address"):
            if source.get(key):
                return str(source[key])
    return None


def _candidate_descriptor(candidate: dict, place: dict, match_type: str,
                          accepted: bool) -> Optional[dict]:
    """Keep only bounded, provider-derived fields needed for a user choice."""
    lat, lng = place.get("lat"), place.get("lng")
    if lat is None or lng is None:
        return None
    name = next((str(source.get("name")) for source in (place, candidate)
                 if source.get("name")), None)
    display = next((str(source.get(key)) for source in (place, candidate)
                    for key in ("formatted_address", "display", "address")
                    if source.get(key)), None)
    label = name or display or _label(candidate, place)
    if not label:
        return None
    admin = {key: values[0] for key, values in _admin_fields(place).items() if values}
    return {
        "provider_ref_id": str(candidate.get("ref_id") or ""),
        "normalized_label": label,
        "display_address": display,
        "admin_components": admin,
        "lat": float(lat),
        "lng": float(lng),
        "match_basis": f"{match_type}_name" if match_type == "poi" else match_type,
        "accepted": bool(accepted),
    }


def _bounded_candidates(rows: list[dict], limit: int = 5) -> Tuple[dict, ...]:
    result = []
    seen = set()
    for row in rows:
        key = (
            _fold_location(row.get("normalized_label") or ""),
            _fold_location(row.get("display_address") or ""),
            round(float(row["lat"]), 6), round(float(row["lng"]), 6),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
        if len(result) >= limit:
            break
    return tuple(result)


def _address_core_matches(query: str, candidate: dict, place: dict) -> bool:
    """Recognize a relevant address preview without weakening full validation."""
    first = next((part.strip() for part in str(query or "").split(",") if part.strip()), "")
    house_pattern = re.compile(r"^((?:[A-Za-z]{1,3}\d{1,5}|\d{1,5}[A-Za-z]?)(?:[/.-]\d{1,5}[A-Za-z]?)?)\s+", re.IGNORECASE)
    street = house_pattern.sub("", first).strip()
    if not street:
        return False
    evidence = " ".join(str(source.get(key) or "") for source in (place, candidate)
                        for key in ("street", "address", "formatted_address", "display", "name"))
    return _fold_location(street) in _fold_location(evidence)


def resolve_location(query: str, kind: str = "admin_area",
                     admin_hints: tuple[str, ...] = ()) -> LocationResolution:
    """Resolve a typed location without conflating provider and validator failures."""
    match_type = {"area": "admin_area", "branch_query": "admin_area"}.get(kind, kind)
    if match_type not in {"admin_area", "address", "poi"}:
        match_type = "admin_area"
    api_key = os.getenv("VIETMAP_API_KEY")
    if not query or not str(query).strip():
        return LocationResolution("not_found", match_type=match_type)
    if not api_key:
        logger.error("[LocationResolve] kind=%s status=provider_error reason=missing_api_key", match_type)
        return LocationResolution("provider_error", match_type=match_type)
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get("https://maps.vietmap.vn/api/search/v3",
                                  params={"apikey": api_key, "text": str(query).strip()})
            response.raise_for_status()
            candidates = response.json()
            candidates = candidates if isinstance(candidates, list) else []
            if not candidates:
                logger.info("[LocationResolve] kind=%s provider_candidates=0 accepted=0 rejected=0 status=not_found",
                            match_type)
                return LocationResolution("not_found", match_type=match_type)

            accepted = []
            rejected_previews = []
            rejected = 0
            candidate_errors = 0
            successful_details = 0
            requested_locality = _locality_parts(query)
            admin_constraints = _admin_constraints(query, admin_hints)
            for candidate in candidates[:8]:
                ref_id = candidate.get("ref_id")
                if not ref_id:
                    rejected += 1
                    continue
                try:
                    place_response = client.get("https://maps.vietmap.vn/api/place/v3",
                                                params={"apikey": api_key, "refid": ref_id})
                    place_response.raise_for_status()
                    place = place_response.json()
                except Exception as exc:
                    candidate_errors += 1
                    logger.warning("[LocationResolveCandidate] kind=%s status=detail_error error=%s",
                                   match_type, type(exc).__name__)
                    continue
                if not isinstance(place, dict):
                    candidate_errors += 1
                    continue
                successful_details += 1
                coords = place.get("lat"), place.get("lng")
                hints_ok = all(_admin_hint_matches(hint, place) for hint in admin_hints)
                if match_type == "poi":
                    semantic_match = _poi_name_matches(query, candidate, place)
                    matches = semantic_match and hints_ok
                elif match_type == "address":
                    semantic_match = _address_core_matches(query, candidate, place)
                    matches = _address_matches(query, candidate, place) and hints_ok
                else:
                    semantic_match = False
                    matches = (
                        _admin_constraints_match(admin_constraints, place)
                        if admin_constraints else
                        _matches_locality(requested_locality, candidate, place)
                    )
                if matches and None not in coords:
                    accepted.append((candidate, place))
                else:
                    rejected += 1
                    if semantic_match:
                        preview = _candidate_descriptor(candidate, place, match_type, False)
                        if preview:
                            rejected_previews.append(preview)

            count = len(candidates)
            if len(accepted) > 1:
                previews = _bounded_candidates([
                    preview for candidate, place in accepted
                    if (preview := _candidate_descriptor(candidate, place, match_type, True))
                ])
                if len(previews) == 1:
                    selected_ref = str(previews[0].get("provider_ref_id") or "")
                    candidate, place = next(
                        ((candidate, place) for candidate, place in accepted
                         if str(candidate.get("ref_id") or "") == selected_ref),
                        accepted[0],
                    )
                    admin = {key: values[0] for key, values in _admin_fields(place).items() if values}
                    logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=%d rejected=%d status=ok basis=provider_place_deduplicated",
                                match_type, count, len(accepted), rejected)
                    return LocationResolution(
                        status="ok", lat=float(place["lat"]), lng=float(place["lng"]), match_type=match_type,
                        normalized_label=_label(candidate, place), administrative_components=admin,
                        provider_candidate_count=count, rejected_candidate_count=rejected,
                        resolution_basis="provider_place_deduplicated",
                        candidate_error_count=candidate_errors,
                        provider_ref_id=str(candidate.get("ref_id") or "") or None,
                    )
                logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=%d rejected=%d status=ambiguous",
                            match_type, count, len(accepted), rejected)
                return LocationResolution("ambiguous", match_type=match_type,
                                          provider_candidate_count=count,
                                          rejected_candidate_count=rejected,
                                          candidate_error_count=candidate_errors,
                                          candidates=previews)
            if not accepted:
                if candidate_errors and not successful_details:
                    logger.error("[LocationResolve] kind=%s provider_candidates=%d accepted=0 rejected=%d candidate_errors=%d status=provider_error",
                                 match_type, count, rejected, candidate_errors)
                    return LocationResolution("provider_error", match_type=match_type,
                                              provider_candidate_count=count,
                                              rejected_candidate_count=rejected,
                                              candidate_error_count=candidate_errors)
                logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=0 rejected=%d status=rejected",
                            match_type, count, rejected)
                return LocationResolution("rejected", match_type=match_type,
                                          provider_candidate_count=count,
                                          rejected_candidate_count=rejected,
                                          candidate_error_count=candidate_errors,
                                          candidates=_bounded_candidates(rejected_previews))
            candidate, place = accepted[0]
            admin = {key: values[0] for key, values in _admin_fields(place).items() if values}
            logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=1 rejected=%d status=ok basis=provider_place",
                        match_type, count, rejected)
            return LocationResolution(
                status="ok", lat=float(place["lat"]), lng=float(place["lng"]), match_type=match_type,
                normalized_label=_label(candidate, place), administrative_components=admin,
                provider_candidate_count=count, rejected_candidate_count=rejected,
                resolution_basis="provider_place", candidate_error_count=candidate_errors,
                provider_ref_id=str(candidate.get("ref_id") or "") or None,
            )
    except Exception as exc:
        logger.error("[LocationResolve] kind=%s status=provider_error error=%s", match_type, type(exc).__name__)
        return LocationResolution("provider_error", match_type=match_type)

def nearby_address_origin(query: str, resolution: LocationResolution) -> Optional[LocationResolution]:
    """Estimate a pickup search origin from already resolved street evidence.

    This never validates a delivery address or makes another provider request.
    Callers must explicitly own a nearby-branch lookup before using it.
    """
    if resolution.status != "rejected" or resolution.match_type != "address":
        return None
    constraints = _admin_constraints(query)
    if not constraints.get("city") or not (constraints.get("ward") or constraints.get("district")):
        return None
    parts = [part.strip() for part in query.split(',') if part.strip()]
    street = re.sub(r"^(?:[A-Za-z]{1,3}\d{1,5}|\d{1,5}[A-Za-z]?)(?:[/.-]\d{1,5}[A-Za-z]?)?\s+", "", parts[0])
    street_key = re.sub(r"^duong\s+", "", _fold_location(street))
    if not street_key:
        return None
    points = set()
    for row in resolution.candidates:
        # Place-detail admin components must match every explicit locality.
        # Similar house numbers or search names alone are insufficient.
        if row.get("match_basis") != "address" or not _admin_constraints_match(
                constraints, row.get("admin_components") or {}):
            continue
        address = _fold_location(row.get("display_address") or "").split(',', 1)[0].strip()
        street_pattern = (r"(?:^|(?<!\w)\d{1,5}[a-z]?(?:[/.-]\d{1,5}[a-z]?)?\s+)"
                          r"(?:duong\s+)?" + re.escape(street_key) + r"$")
        if not re.search(street_pattern, address):
            continue
        try:
            lat, lng = float(row['lat']), float(row['lng'])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180:
            points.add((lat, lng))
    if not points or any(haversine_distance(*a, *b) > 2 for a in points for b in points):
        return None  # Scattered results cannot locate a useful nearby origin.
    return LocationResolution('ok', lat=sum(p[0] for p in points) / len(points),
        lng=sum(p[1] for p in points) / len(points), match_type='address',
        normalized_label=', '.join([street, *parts[1:]]), resolution_basis='street_area_estimate')


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    Returns distance in kilometers.
    """
    if None in (lat1, lon1, lat2, lon2):
        return float('inf')
        
    # Convert decimal degrees to radians 
    lon1, lat1, lon2, lat2 = map(math.radians, [float(lon1), float(lat1), float(lon2), float(lat2)])

    # Haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371 # Radius of earth in kilometers. Use 3956 for miles
    return c * r

def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """
    Sử dụng Vietmap API để geocode địa chỉ thành tọa độ (lat, lng).
    Cần cấu hình VIETMAP_API_KEY trong môi trường.
    Returns: (latitude, longitude) hoặc None nếu lỗi/không tìm thấy.
    """
    if not address or not address.strip():
        return None
    from src.agents.location_parser import parse_location
    if parse_location(address).kind in {"reference", "reference_question", "change_reference"}:
        logger.warning("[Geo] Skipped unresolved address reference")
        return None
        
    parsed = parse_location(address)
    kind = parsed.kind if parsed.kind in {"area", "address", "poi", "branch_query"} else (
        "address" if re.match(r"^\d+[A-Za-z]?(?:[/.-]\d+[A-Za-z]?)?\s", address.strip()) else "area"
    )
    result = resolve_location(address, kind, getattr(parsed, "admin_hints", ()))
    return (result.lat, result.lng) if result.status == "ok" else None
