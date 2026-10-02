import os
import math
import httpx
import logging
import re
import unicodedata
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
        
    api_key = os.getenv("VIETMAP_API_KEY")
    if not api_key:
        logger.error("[Geo] Missing VIETMAP_API_KEY in environment variables.")
        return None
        
    try:
        search_url = "https://maps.vietmap.vn/api/search/v3"
        search_params = {
            "apikey": api_key,
            "text": address.strip()
        }
        
        with httpx.Client(timeout=10.0) as client:
            # Bước 1: Gọi search API lấy ref_id
            search_resp = client.get(search_url, params=search_params)
            search_resp.raise_for_status()
            search_data = search_resp.json()
            
            if isinstance(search_data, list) and len(search_data) > 0:
                requested = _locality_parts(address)
                for candidate in search_data[:8]:
                    ref_id = candidate.get("ref_id")
                    if not ref_id:
                        continue
                    # Bước 2: Gọi place API lấy lat/lng từ ref_id
                    place_url = "https://maps.vietmap.vn/api/place/v3"
                    place_params = {
                        "apikey": api_key,
                        "refid": ref_id
                    }
                    place_resp = client.get(place_url, params=place_params)
                    place_resp.raise_for_status()
                    place_data = place_resp.json()
                    
                    if place_data and _matches_locality(requested, candidate, place_data) and place_data.get("lat") is not None and place_data.get("lng") is not None:
                        return float(place_data["lat"]), float(place_data["lng"])
            
            logger.warning("[Geo] Geocode trả về 0 kết quả cho địa chỉ: %s", address)
            return None
            
    except Exception as e:
        logger.error("[Geo] provider=VietMap operation=geocode error=%s", type(e).__name__)
        return None
