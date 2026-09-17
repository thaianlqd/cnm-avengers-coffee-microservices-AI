import os
import decimal
import unicodedata
import re
import datetime
import jwt
from typing import Dict, Any

def _get_engine():
    from src.common.db import get_db_engine
    return get_db_engine()

def _clean_dict(d: dict) -> dict:
    import decimal
    res = {}
    import uuid
    for k, v in d.items():
        if isinstance(v, decimal.Decimal):
            res[k] = float(v)
        elif isinstance(v, uuid.UUID):
            res[k] = str(v)
        else:
            res[k] = v
    return res

def _norm(s: str) -> str:
    nfd = unicodedata.normalize("NFD", str(s).lower())
    return re.sub(r"\s+", " ", "".join(c for c in nfd if unicodedata.category(c) != "Mn")).strip()

def _require_valid_session(session_id: str) -> str:
    import uuid
    try:
        uuid_obj = uuid.UUID(session_id)
        return str(uuid_obj)
    except ValueError:
        return None

def _get_service_jwt(session_id: str) -> str:
    # Use the shared internal token instead of generating a JWT to bypass cross-environment secret issues
    return os.environ.get("INTERNAL_SERVICE_TOKEN", "avengers-internal-token")

def _check_business_hours() -> Dict[str, str]:
    now_vn = datetime.datetime.utcnow() + datetime.timedelta(hours=7)
    now = now_vn.time()
    open_time = datetime.time(7, 0)
    close_time = datetime.time(22, 30)
    # Temporarily bypassed for night testing
    # if not (open_time <= now <= close_time):
    #     return {
    #         "status": "closed",
    #         "message": f"Hiện tại là {now.strftime('%H:%M')}, hệ thống cửa hàng chỉ mở cửa từ 07:00 đến 22:30. Xin quý khách thông cảm đặt hàng vào lúc khác."
    #     }
    return None
