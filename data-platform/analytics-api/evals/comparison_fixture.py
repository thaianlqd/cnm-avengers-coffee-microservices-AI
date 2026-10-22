"""Independent comparison/selection fixture and hand-written oracle (CW00, H.7).

The data mirrors evaluation/comparison-workspace-20261022/independent-fixture-spec.json
(Alpha/Beta in scope, a very large Gamma outside it) plus a monthly history used by
selection criteria. Expected values are computed here from raw rows with plain Python;
nothing in this module imports the production compiler, renderer, insight or claim code,
so a shared bug cannot make the oracle agree with the product.

Member roles (Alpha/Beta/Gamma) are bound to catalog-known province names through
``CITIES`` so free-text input integrity can verify them; transfer runs rebind the roles to
other provinces. No production code may reference these names.
"""
from collections import defaultdict
from copy import deepcopy
from statistics import mean, pstdev

VALID = ('HOAN_THANH', 'DANG_GIAO')
TERMINAL = ('HOAN_THANH', 'DA_HUY')

CITIES = {'Alpha': 'Cần Thơ', 'Beta': 'Hải Phòng', 'Gamma': 'Hà Nội'}

_STORES = [
    dict(ma_chi_nhanh='sa1', ten_chi_nhanh='Alpha Trung tâm', thanh_pho='Alpha', loai_diem_ban='CHI_NHANH_CHINH'),
    dict(ma_chi_nhanh='sa2', ten_chi_nhanh='Alpha Kiosk', thanh_pho='Alpha', loai_diem_ban='KIOSK_VE_TINH'),
    dict(ma_chi_nhanh='sb1', ten_chi_nhanh='Beta Trung tâm', thanh_pho='Beta', loai_diem_ban='CHI_NHANH_CHINH'),
    dict(ma_chi_nhanh='sb2', ten_chi_nhanh='Beta Kiosk', thanh_pho='Beta', loai_diem_ban='KIOSK_NHUONG_QUYEN'),
    dict(ma_chi_nhanh='sg1', ten_chi_nhanh='Gamma Trung tâm', thanh_pho='Gamma', loai_diem_ban='CHI_NHANH_CHINH'),
]

# (id, store, amount, status, customer, timestamp, order_type) — spec orders A1..G1.
_ORDERS = [
    ('A1', 'sa1', 100, 'HOAN_THANH', 'U1', '2027-01-10T10:00:00', 'DUNG_TAI_CHO'),
    ('A2', 'sa2', 200, 'HOAN_THANH', 'U1', '2027-02-10T10:00:00', 'MANG_DI'),
    ('A3', 'sa1', 900, 'DA_HUY', 'U9', '2027-02-11T10:00:00', 'GIAO_TAN_NOI'),
    ('B1', 'sb1', 400, 'HOAN_THANH', 'U1', '2027-01-10T11:00:00', 'GIAO_TAN_NOI'),
    ('B2', 'sb1', 200, 'HOAN_THANH', 'U2', '2027-02-10T11:00:00', 'DUNG_TAI_CHO'),
    ('B3', 'sb2', 100, 'HOAN_THANH', 'U2', '2027-02-11T11:00:00', 'MANG_DI'),
    ('B4', 'sb1', 70, 'DA_HUY', 'U8', '2027-02-12T11:00:00', 'GIAO_TAN_NOI'),
    ('B5', 'sb2', 80, 'DA_HUY', 'U8', '2027-02-13T11:00:00', 'GIAO_TAN_NOI'),
    ('G1', 'sg1', 1000000, 'HOAN_THANH', 'U3', '2027-02-10T12:00:00', 'DUNG_TAI_CHO'),
]
REFERENCE = '2027-03-15'


def stores(cities=None):
    cities = cities or CITIES
    return [dict(s, thanh_pho=cities[s['thanh_pho']], ten_chi_nhanh=s['ten_chi_nhanh'].replace(s['thanh_pho'], cities[s['thanh_pho']]))
            for s in deepcopy(_STORES)]


def orders(gamma_amount=1000000):
    out = []
    for oid, store, amount, status, customer, ts, kind in _ORDERS:
        out.append(dict(ma_don_hang=oid, ma_nguoi_dung=customer, co_so_ma=store,
                        tong_tien=gamma_amount if oid == 'G1' else amount, ma_voucher=None, so_tien_giam=0,
                        trang_thai_don_hang=status, loai_don_hang=kind, ngay_tao=ts))
    return out


def warehouse_data(gamma_amount=1000000, extra_orders=(), cities=None):
    """Overlay for evals.fixture_warehouse.DATA (patch.dict)."""
    return {'chi_nhanh': stores(cities), 'don_hang': orders(gamma_amount) + [dict(o) for o in extra_orders],
            'chi_tiet_don_hang': [], 'giao_dich_thanh_toan': []}


def _city(order, stores):
    return next(s['thanh_pho'] for s in stores if s['ma_chi_nhanh'] == order['co_so_ma'])


def _store_type(order, stores):
    return next(s['loai_diem_ban'] for s in stores if s['ma_chi_nhanh'] == order['co_so_ma'])


def oracle(data, members, breakdown=None, month=False):
    """Per-member (and union) values for the spec metrics, from raw rows only.

    ``breakdown`` is a raw field name of the order ('loai_don_hang') or 'store_type'.
    Returns {member_or_'union': {group_key: {metric: value}}}.
    """
    stores = data['chi_nhanh']
    out = {}
    for member in list(members) + ['union']:
        scope = [o for o in data['don_hang'] if _city(o, stores) in (members if member == 'union' else [member])]
        groups = defaultdict(list)
        for o in scope:
            key = []
            if month:
                key.append(o['ngay_tao'][:7])
            if breakdown == 'store_type':
                key.append(_store_type(o, stores))
            elif breakdown:
                key.append(o[breakdown])
            groups[tuple(key)].append(o)
        values = {}
        for key, rows in groups.items():
            valid = [o for o in rows if o['trang_thai_don_hang'] in VALID]
            terminal = [o for o in rows if o['trang_thai_don_hang'] in TERMINAL]
            revenue = sum(o['tong_tien'] for o in valid)
            values[key] = dict(
                revenue=revenue if valid else None,
                valid_order_count=len(valid),
                aov=revenue / len(valid) if valid else None,
                cancelled_terminal_order_count=sum(o['trang_thai_don_hang'] == 'DA_HUY' for o in terminal),
                terminal_order_count=len(terminal),
                purchasing_customer_count=len({o['ma_nguoi_dung'] for o in valid}),
            )
        out[member] = values
    return out


def monthly_series(data, member_field='thanh_pho', metric='revenue'):
    """{member: {YYYY-MM: value}} over valid orders; months without valid orders are absent (missing ≠ 0)."""
    stores = {s['ma_chi_nhanh']: s for s in data['chi_nhanh']}
    series = defaultdict(lambda: defaultdict(float))
    for o in data['don_hang']:
        if o['trang_thai_don_hang'] not in VALID:
            continue
        member = stores[o['co_so_ma']][member_field]
        series[member][o['ngay_tao'][:7]] += o['tong_tien'] if metric == 'revenue' else 1
    return {m: dict(v) for m, v in series.items()}


def cv(values):
    """Population coefficient of variation; None when undefined (mean 0 or <2 points)."""
    if len(values) < 2:
        return None
    m = mean(values)
    return None if m <= 0 else pstdev(values) / m


def growth(values):
    """First→last complete-bucket relative change; None when baseline is 0 or <2 points."""
    if len(values) < 2 or values[0] <= 0:
        return None
    return (values[-1] - values[0]) / values[0]


SELECTION_SERIES = {'sa1': [100, 110, 90, 100], 'sb1': [100, 300, 50, 200], 'sg1': [500, 520, 480, 500],
                    'sa2': [10, 20, 40, 80], 'sb2': [60, 50, 40, 30]}


def selection_data(series=None, cities=None):
    """Four complete months (2026-09..12) per store; Alpha/Gamma stable, Beta volatile; kiosks trend."""
    data = warehouse_data(cities=cities)
    rows = []
    for i, (store, values) in enumerate(sorted((series or SELECTION_SERIES).items())):
        for m, v in enumerate(values):
            if v is None:
                continue
            rows.append(dict(ma_don_hang=f'S{i}{m}', ma_nguoi_dung='U1', co_so_ma=store, tong_tien=v, ma_voucher=None,
                             so_tien_giam=0, trang_thai_don_hang='HOAN_THANH', loai_don_hang='MANG_DI',
                             ngay_tao=f'2026-{9 + m:02d}-05T10:00:00'))
    data['don_hang'] = rows
    return data
