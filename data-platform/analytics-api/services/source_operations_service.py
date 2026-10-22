"""Bounded read-only health checks and requests to the existing replica worker."""
import threading
import time
from copy import deepcopy
from fastapi import HTTPException

_refresh_lock=threading.Lock()
_last_refresh=0
_coverage=None


def health_refresh(principal=None):
    global _last_refresh,_coverage
    from services import data_coverage_service
    with _refresh_lock:
        if _coverage is None or time.monotonic()-_last_refresh>10:
            try:
                value=deepcopy(data_coverage_service.refresh())
            except Exception:
                raise HTTPException(503,'Chưa đọc được trạng thái nguồn. Kiểm tra kết nối kho và thử lại.') from None
            # Same public view-level evidence as capabilities; no replica certificates.
            value.get('data_health',{})['datasets']={}
            _coverage=value
            _last_refresh=time.monotonic()
        value=deepcopy(_coverage)
    # Apply the same account projection as /ai/capabilities after the shared
    # cache read. Never cache one account's authorized subset for another.
    if principal is not None:
        value['facts']={name:item for name,item in value.get('facts',{}).items()
                        if principal.permits('analytics.read',name)}
        health=value.get('data_health',{})
        health['views']={name:item for name,item in health.get('views',{}).items()
                         if principal.permits('analytics.read',name)}
        if not principal.national:
            value['overall']={'min_date':None,'max_date':None}
            value['facts']={}
            value['bounds_basis']='Account scope bounds not measured; no global bounds assumed'
    return value


def sync_status(principal):
    from sync_control import observe
    try:status=observe()
    except Exception:status={'configured':False,'worker_available':False,'operation':None}
    if status.get('operation'):
        status['operation'].pop('worker_id',None)
    return {**status,'can_trigger':principal.permits('pipeline.trigger')}


def request_sync():
    from sync_control import enqueue
    try:operation,created=enqueue()
    except ValueError:
        raise HTTPException(429,'Vừa kết thúc một lượt đồng bộ. Chờ 60 giây trước khi yêu cầu tiếp.') from None
    except Exception:
        raise HTTPException(503,'Worker đồng bộ chưa sẵn sàng. Không có tác vụ nào được khởi chạy; kiểm tra dịch vụ data-sync.') from None
    operation.pop('worker_id',None)
    return {'operation':operation,'created':created}
