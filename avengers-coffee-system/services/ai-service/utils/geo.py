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
    if parts and re.match(r'^\d+[a-z]?(?:[/.-]\d+[a-z]?)?\s', _fold_location(parts[0])):
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
    street = re.sub(r"^\d+[A-Za-z]?(?:[/.-]\d+[A-Za-z]?)?\s+", "", parts[0]).strip()
    street_folded = _fold_location(street)
    street_sources = " ".join(str(source.get(key) or "") for source in (place, candidate)
                              for key in ("street", "address", "formatted_address", "display", "name"))
    if not street_folded or street_folded not in _fold_location(street_sources):
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
            rejected = 0
            requested_locality = _locality_parts(query)
            for candidate in candidates[:8]:
                ref_id = candidate.get("ref_id")
                if not ref_id:
                    rejected += 1
                    continue
                place_response = client.get("https://maps.vietmap.vn/api/place/v3",
                                            params={"apikey": api_key, "refid": ref_id})
                place_response.raise_for_status()
                place = place_response.json()
                if not isinstance(place, dict):
                    rejected += 1
                    continue
                coords = place.get("lat"), place.get("lng")
                hints_ok = all(_admin_hint_matches(hint, place) for hint in admin_hints)
                if match_type == "poi":
                    matches = _poi_name_matches(query, candidate, place) and hints_ok
                elif match_type == "address":
                    matches = _address_matches(query, candidate, place) and hints_ok
                else:
                    matches = _matches_locality(requested_locality, candidate, place)
                if matches and None not in coords:
                    accepted.append((candidate, place))
                else:
                    rejected += 1

            count = len(candidates)
            if len(accepted) > 1:
                logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=%d rejected=%d status=ambiguous",
                            match_type, count, len(accepted), rejected)
                return LocationResolution("ambiguous", match_type=match_type,
                                          provider_candidate_count=count,
                                          rejected_candidate_count=rejected)
            if not accepted:
                logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=0 rejected=%d status=rejected",
                            match_type, count, rejected)
                return LocationResolution("rejected", match_type=match_type,
                                          provider_candidate_count=count,
                                          rejected_candidate_count=rejected)
            candidate, place = accepted[0]
            admin = {key: values[0] for key, values in _admin_fields(place).items() if values}
            logger.info("[LocationResolve] kind=%s provider_candidates=%d accepted=1 rejected=%d status=ok basis=provider_place",
                        match_type, count, rejected)
            return LocationResolution(
                "ok", float(place["lat"]), float(place["lng"]), match_type,
                _label(candidate, place), admin, count, rejected, "provider_place",
            )
    except Exception as exc:
        logger.error("[LocationResolve] kind=%s status=provider_error error=%s", match_type, type(exc).__name__)
        return LocationResolution("provider_error", match_type=match_type)

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
