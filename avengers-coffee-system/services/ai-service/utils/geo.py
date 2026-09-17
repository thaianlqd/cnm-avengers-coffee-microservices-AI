import os
import math
import httpx
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

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
                ref_id = search_data[0].get("ref_id")
                if ref_id:
                    # Bước 2: Gọi place API lấy lat/lng từ ref_id
                    place_url = "https://maps.vietmap.vn/api/place/v3"
                    place_params = {
                        "apikey": api_key,
                        "refid": ref_id
                    }
                    place_resp = client.get(place_url, params=place_params)
                    place_resp.raise_for_status()
                    place_data = place_resp.json()
                    
                    if place_data and place_data.get("lat") and place_data.get("lng"):
                        return float(place_data["lat"]), float(place_data["lng"])
            
            logger.warning("[Geo] Geocode trả về 0 kết quả cho địa chỉ: %s", address)
            return None
            
    except Exception as e:
        logger.error("[Geo] Lỗi khi gọi Vietmap API cho '%s': %s", address, e)
        return None

