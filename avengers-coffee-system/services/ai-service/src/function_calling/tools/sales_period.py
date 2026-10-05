"""Vietnam calendar windows shared semantically with Menu's sales badges."""
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo

VIETNAM = ZoneInfo('Asia/Ho_Chi_Minh')


def sales_window(period='month', anchor=None, now=None):
    now = now or datetime.now(timezone.utc)
    if period not in {'day', 'week', 'month', 'year', 'all'}:
        raise ValueError('invalid sales period')
    local = date.fromisoformat(anchor) if anchor else now.astimezone(VIETNAM).date()
    if anchor and local.isoformat() != anchor:
        raise ValueError('date must be YYYY-MM-DD')
    if period == 'all':
        return None, now
    if period == 'week':
        local -= timedelta(days=local.weekday())
    elif period == 'month':
        local = local.replace(day=1)
    elif period == 'year':
        local = local.replace(month=1, day=1)
    if period == 'month':
        end = date(local.year + (local.month == 12), local.month % 12 + 1, 1)
    elif period == 'year':
        end = date(local.year + 1, 1, 1)
    else:
        end = local + timedelta(days=7 if period == 'week' else 1)
    return datetime.combine(local, time(), VIETNAM), min(datetime.combine(end, time(), VIETNAM), now)
