"""Deterministic RICH fixture rows for analysis-depth acceptance (FINAL plan 2026-10-19, P0/P1).

Why a second fixture: ``fixture_warehouse.DATA`` has 4 orders / 2 stores, so a depth test on it proves nothing about
breadth (a one-store, one-month slice can never reach 4/6/8 independent views). This module only *generates rows*;
the FixtureWarehouse, compiler and guards stay the production ones. Every number is derived from the generated rows
by an independent Python oracle (``order_rate_oracle``), never from compiler output and never hard-coded.

Use with ``unittest.mock.patch.dict(fixture_warehouse.DATA, rich_orders_data())``.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta

# (id, name, city, store_type) -- four Ho Chi Minh branches, two Ha Noi distractors (scope must stay HCM).
RICH_STORES = [
    ('s1', 'Quán Bến Thành', 'Hồ Chí Minh', 'CHI_NHANH_CHINH'),
    ('s2', 'Quán Tân Định', 'Hồ Chí Minh', 'CHI_NHANH_CHINH'),
    ('s3', 'Kiosk Phú Mỹ', 'Hồ Chí Minh', 'KIOSK_NHUONG_QUYEN'),
    ('s4', 'Kiosk Thủ Đức', 'Hồ Chí Minh', 'KIOSK_VE_TINH'),
    ('s5', 'Quán Hoàn Kiếm', 'Hà Nội', 'CHI_NHANH_CHINH'),
    ('s6', 'Quán Cầu Giấy', 'Hà Nội', 'CHI_NHANH_CHINH'),
]
ORDER_TYPES = ('DUNG_TAI_CHO', 'MANG_DI', 'GIAO_TAN_NOI')
PAYMENTS = ('TIEN_MAT', 'VNPAY', 'NGAN_HANG_QR')
# Cancellation propensity in percent, deliberately different per store and per order type so every
# segmentation lens has real variance (a uniform fixture would make breadth look artificially fine).
STORE_CANCEL = {'s1': 4, 's2': 9, 's3': 14, 's4': 7, 's5': 5, 's6': 6}
TYPE_CANCEL = {'DUNG_TAI_CHO': 0, 'MANG_DI': 4, 'GIAO_TAN_NOI': 12}


def _lcg(seed):
    state = seed
    while True:
        state = (1103515245 * state + 12345) % (2 ** 31)
        yield state


def rich_orders(year=2026, month=9, days=30, per_store_day=4, seed=20261019, prefix='o'):
    rnd = _lcg(seed)
    orders, n = [], 0
    for day in range(1, days + 1):
        for sid, *_ in RICH_STORES:
            for k in range(per_store_day + (day % 3 == 0)):
                n += 1
                r = next(rnd)
                otype = ORDER_TYPES[r % 3]
                pay = PAYMENTS[(r // 7) % 3]
                hour = 7 + (r // 11) % 14
                cancel_p = STORE_CANCEL[sid] + TYPE_CANCEL[otype]
                status = 'DA_HUY' if (r // 13) % 100 < cancel_p else 'HOAN_THANH'
                if day >= days - 1 and (r // 17) % 5 == 0:
                    status = 'DANG_GIAO'          # still in progress: must stay OUTSIDE the terminal denominator
                total = 50000 + (r // 19) % 150000
                orders.append(dict(
                    ma_don_hang=f'{prefix}{n}', ma_nguoi_dung=f'u{1 + n % 24}', co_so_ma=sid, tong_tien=total,
                    ma_voucher=None, so_tien_giam=0, trang_thai_don_hang=status, loai_don_hang=otype,
                    phuong_thuc_thanh_toan=pay,
                    ngay_tao=datetime(year, month, day, hour, (r // 23) % 60).isoformat()))
    return orders


def rich_orders_data(**kwargs):
    orders = rich_orders(**kwargs)
    stores = [dict(ma_chi_nhanh=i, ten_chi_nhanh=n, thanh_pho=c, loai_diem_ban=t) for i, n, c, t in RICH_STORES]
    users = [dict(ma_nguoi_dung=f'u{i}', vai_tro='CUSTOMER', tong_chi_tieu=100000 * i, ngay_tao='2026-08-01T10:00:00')
             for i in range(1, 25)]
    return {'chi_nhanh': stores, 'don_hang': orders, 'nguoi_dung': users, 'chi_tiet_don_hang': [],
            'giao_dich_thanh_toan': []}


# ---- independent oracle (shares no code with the compiler) ---------------------------------------------------
TERMINAL = ('HOAN_THANH', 'DA_HUY')


def order_rate_oracle(orders, stores, *, city=None, start=None, end=None, group=None):
    """Cancellation rate = DA_HUY / (HOAN_THANH + DA_HUY) * 100, recomputed from counts per group."""
    city_of = {i: c for i, _, c, _ in RICH_STORES}
    name_of = {i: n for i, n, *_ in RICH_STORES}
    type_of = {i: t for i, _, _, t in RICH_STORES}
    groups = defaultdict(lambda: [0, 0])
    for o in orders:
        if o['trang_thai_don_hang'] not in TERMINAL:
            continue
        d = o['ngay_tao'][:10]
        if (start and d < start) or (end and d > end) or (city and city_of[o['co_so_ma']] != city):
            continue
        key = {None: 'all', 'store': name_of[o['co_so_ma']], 'order_type': o['loai_don_hang'],
               'store_type': type_of[o['co_so_ma']], 'payment_method': o['phuong_thuc_thanh_toan'],
               'day': d}[group]
        groups[key][1] += 1
        groups[key][0] += o['trang_thai_don_hang'] == 'DA_HUY'
    return {k: dict(cancelled=c, terminal=t, rate=round(100.0 * c / t, 2) if t else None) for k, (c, t) in groups.items()}


# ---- full multi-domain rich data (every silver table the 16 governed domains read) ------------------------------
CATEGORIES = [('c1', 'Cà phê'), ('c2', 'Trà'), ('c3', 'Sinh tố'), ('c4', 'Bánh')]
PRODUCT_ROWS = [(f'p{i}', f'Món {i}', CATEGORIES[i % 4][0], CATEGORIES[i % 4][1], 25000 + 5000 * (i % 5)) for i in range(1, 13)]
SHIFTS = ('Ca sáng', 'Ca chiều', 'Ca tối')
ATTENDANCE = ('DUNG_GIO', 'DI_TRE', 'VE_SOM')
GATEWAYS = ('VNPAY', 'MOMO', 'ZALOPAY')


def rich_stores():
    cities = {'s7': 'Đà Nẵng', 's8': 'Đà Nẵng'}
    extra = [('s7', 'Quán Hải Châu', 'Đà Nẵng', 'CHI_NHANH_CHINH'), ('s8', 'Kiosk Sơn Trà', 'Đà Nẵng', 'KIOSK_VE_TINH')]
    return [dict(ma_chi_nhanh=i, ten_chi_nhanh=n, thanh_pho=c, loai_diem_ban=t) for i, n, c, t in RICH_STORES + extra]


def rich_world(seed=20261019, months=((2026, 8, 31), (2026, 9, 30))):
    """Coherent rows for all 21 silver tables: Aug + Sep 2026, 8 stores, 3 cities, deterministic."""
    rnd = _lcg(seed)
    nxt = lambda: next(rnd)
    stores = rich_stores()
    for s in stores:
        STORE_CANCEL.setdefault(s['ma_chi_nhanh'], 6)
    orders = []
    for year, month, days in months:
        for part in rich_orders(year=year, month=month, days=days, per_store_day=3, seed=seed + month, prefix=f'o{month}_'):
            orders.append(part)
    extra_stores = [s['ma_chi_nhanh'] for s in stores if s['ma_chi_nhanh'] in ('s7', 's8')]
    n = len(orders)
    for year, month, days in months:
        for day in range(1, days + 1):
            for sid in extra_stores:
                for _ in range(3):
                    n += 1; r = nxt()
                    otype = ORDER_TYPES[r % 3]
                    status = 'DA_HUY' if (r // 13) % 100 < 8 else 'HOAN_THANH'
                    orders.append(dict(ma_don_hang=f'ox{n}', ma_nguoi_dung=f'u{1 + n % 24}', co_so_ma=sid, tong_tien=60000 + (r // 19) % 120000,
                        ma_voucher=None, so_tien_giam=0, trang_thai_don_hang=status, loai_don_hang=otype,
                        phuong_thuc_thanh_toan=PAYMENTS[(r // 7) % 3],
                        ngay_tao=datetime(year, month, day, 7 + (r // 11) % 14, (r // 23) % 60).isoformat()))
    vouchers = [('v1', 'Ưu đãi A'), ('v2', 'Ưu đãi B'), ('v3', 'Ưu đãi C')]
    for i, o in enumerate(orders):
        o.setdefault('trang_thai_thanh_toan', 'DA_THANH_TOAN' if o['trang_thai_don_hang'] == 'HOAN_THANH' else 'CHUA_THANH_TOAN')
        if i % 5 == 0 and o['trang_thai_don_hang'] != 'DA_HUY':
            code = vouchers[i % 3][0]; o['ma_voucher'] = code; o['so_tien_giam'] = 5000 * (1 + i % 3)
    users = [dict(ma_nguoi_dung=f'u{i}', ho_ten=f'Khách {i}', vai_tro='STAFF' if i % 12 == 0 else 'CUSTOMER', trang_thai='ACTIVE',
                  diem_loyalty=10 * i, tong_chi_tieu=100000 * i + 5000 * (i % 7), ngay_tao=f'2026-0{7 + i % 3}-{1 + i % 27:02d}T10:00:00') for i in range(1, 41)]
    products = [dict(ma_san_pham=p, ten_san_pham=nme, ma_danh_muc=c, ten_danh_muc=cn, gia_ban=price, gia_niem_yet=price, trang_thai=True, la_hot=False, la_moi=False)
                for p, nme, c, cn, price in PRODUCT_ROWS]
    lines, pays, deliveries, k = [], [], [], 0
    for o in orders:
        for j in range(1 + hash_i(o['ma_don_hang']) % 3):
            k += 1; prod = PRODUCT_ROWS[(k * 7) % len(PRODUCT_ROWS)]; qty = 1 + k % 3
            lines.append(dict(id=f'l{k}', ma_don_hang=o['ma_don_hang'], ma_san_pham=prod[0], ten_san_pham=prod[1], gia_ban=prod[4], so_luong=qty, thanh_tien=prod[4] * qty))
        if o['trang_thai_don_hang'] != 'DA_HUY':
            pays.append(dict(ma_giao_dich=f't{len(pays) + 1}', ma_don_hang=o['ma_don_hang'], cong_thanh_toan=GATEWAYS[len(pays) % 3], so_tien=o['tong_tien'],
                             trang_thai='THANH_CONG' if len(pays) % 9 else 'THAT_BAI', ngay_tao=o['ngay_tao']))
        if o['loai_don_hang'] == 'GIAO_TAN_NOI':
            st = {'HOAN_THANH': 'DELIVERED', 'DA_HUY': 'CANCELLED'}.get(o['trang_thai_don_hang'], 'DANG_GIAO')
            if st == 'DELIVERED' and len(deliveries) % 11 == 0:
                st = 'FAILED'
            day = datetime.fromisoformat(o['ngay_tao'])
            deliveries.append(dict(ma_giao_hang=f'g{len(deliveries) + 1}', ma_don_hang=o['ma_don_hang'], ma_shipper=f'd{1 + len(deliveries) % 6}',
                trang_thai_giao_hang=st, thoi_gian_nhan_chuyen=day.isoformat(), thoi_gian_lay_hang=(day + timedelta(minutes=8)).isoformat(),
                thoi_gian_ket_thuc=(day + timedelta(minutes=30 + len(deliveries) % 25)).isoformat(), thoi_gian_du_kien_phut=35, phi_giao_hang=15000, giao_ghep=False))
    shippers = [dict(ma_shipper=f'd{i}', ho_ten=f'Shipper {i}', trang_thai='ACTIVE', tong_chuyen_giao=20 * i, diem_danh_gia=3.5 + (i % 4) * 0.4) for i in range(1, 7)]
    stock = [dict(id=f's{s["ma_chi_nhanh"]}{p[0]}', co_so_ma=s['ma_chi_nhanh'], ma_san_pham=p[0], ten_san_pham=p[1], so_luong_ton=(hash_i(s['ma_chi_nhanh'], p[0]) % 60),
                  muc_canh_bao=20, dang_kinh_doanh=True, cap_nhat_luc='2026-09-30T20:00:00') for s in stores for p in PRODUCT_ROWS]
    preview, sreview, shifts, cash, survey, wish, usage = [], [], [], [], [], [], []
    for i, o in enumerate(orders):
        if o['trang_thai_don_hang'] == 'HOAN_THANH' and hash_i(o['ma_don_hang'], 'review') % 3 == 0:
            prod = PRODUCT_ROWS[hash_i(o['ma_don_hang']) % len(PRODUCT_ROWS)]
            preview.append(dict(id=f'pr{i}', ma_san_pham=prod[0], ten_san_pham=prod[1], ma_nguoi_dung=o['ma_nguoi_dung'], so_sao=3 + (i % 3), ma_don_hang=o['ma_don_hang'], ngay_tao=o['ngay_tao']))
            sreview.append(dict(id=f'sr{i}', ma_chi_nhanh=o['co_so_ma'], ten_chi_nhanh=next(s['ten_chi_nhanh'] for s in stores if s['ma_chi_nhanh'] == o['co_so_ma']),
                                ma_nguoi_dung=o['ma_nguoi_dung'], so_sao=2 + (i % 4), ma_don_hang=o['ma_don_hang'], ngay_tao=o['ngay_tao']))
        if i % 4 == 0:
            survey.append(dict(id=f'sv{i}', ma_bieu_mau=1, ma_nguoi_dung=o['ma_nguoi_dung'], ma_don_hang=o['ma_don_hang'], co_so_ma=o['co_so_ma'], tra_loi='{}',
                               trang_thai_voucher='DA_TANG', ngay_tao=o['ngay_tao']))
        if o['ma_voucher']:
            usage.append(dict(ma_su_dung=i, ma_khuyen_mai=o['ma_voucher'], ten_khuyen_mai=dict(vouchers)[o['ma_voucher']], loai_khuyen_mai='FIXED',
                              co_so_ma=o['co_so_ma'], so_tien_giam=o['so_tien_giam'], ngay_su_dung=o['ngay_tao']))
    for year, month, days in months:
        for day in range(1, days + 1):
            for s in stores:
                for si, shift in enumerate(SHIFTS):
                    r = nxt()
                    if (r // 29) % 9 == 0 and si:  # some evening/afternoon shifts are not scheduled (realistic, uneven exposure)
                        continue
                    shifts.append(dict(ma_ca_lam_viec=f'w{len(shifts)}', staff_name=f'NV{si}', staff_username=f'nv{si}', ngay_lam_viec=f'{year}-{month:02d}-{day:02d}',
                        ten_ca=shift, gio_bat_dau='07:00', gio_ket_thuc='15:00', trang_thai_cham_cong=ATTENDANCE[0 if r % 7 else (1 + r % 2)],
                        co_so_ma=s['ma_chi_nhanh'], note=''))
                if day % 2 == 0:
                    r = nxt()
                    cash.append(dict(ma_ca=f'k{len(cash)}', co_so_ma=s['ma_chi_nhanh'], ten_nhan_vien='NV', thoi_gian_bat_dau=f'{year}-{month:02d}-{day:02d}T07:00:00',
                        thoi_gian_ket_thuc=f'{year}-{month:02d}-{day:02d}T15:00:00', tien_dau_ca=500000, tien_cuoi_ca=1500000, tien_mat_he_thong=1000000,
                        doanh_thu_he_thong=2000000, tien_mat_ky_vong=1500000, chenh_lech=(r % 9 - 4) * 150000, tong_don=20, tong_don_tien_mat=8,
                        trang_thai_phe_duyet='DA_DUYET', ghi_chu='', ngay_tao=f'{year}-{month:02d}-{day:02d}T16:00:00'))
    for i in range(1, 41):
        for j in range(1 + i % 3):
            prod = PRODUCT_ROWS[(i + j) % len(PRODUCT_ROWS)]
            wish.append(dict(id=f'wl{len(wish)}', ma_nguoi_dung=f'u{i}', ma_san_pham=prod[0], ten_san_pham=prod[1], gia_ban=prod[4], danh_muc=prod[3],
                             ngay_tao=f'2026-0{8 + (i + j) % 2}-{1 + (i * 7 + j) % 28:02d}T10:00:00'))
    cats = [dict(ma_danh_muc=c, ten_danh_muc=n) for c, n in CATEGORIES]
    promos = [dict(ma_khuyen_mai=c, ten_khuyen_mai=n) for c, n in vouchers]
    return {'chi_nhanh': stores, 'don_hang': orders, 'nguoi_dung': users, 'san_pham': products, 'danh_muc': cats, 'chi_tiet_don_hang': lines,
            'giao_dich_thanh_toan': pays, 'giao_hang': deliveries, 'shipper': shippers, 'ton_kho_san_pham': stock, 'danh_gia_san_pham': preview,
            'danh_gia_chi_nhanh': sreview, 'ca_lam_viec_nhan_vien': shifts, 'ca_doi_soat': cash, 'khao_sat_phan_hoi': survey,
            'yeu_thich_san_pham': wish, 'khuyen_mai': promos, 'voucher': promos, 'khuyen_mai_su_dung': usage}


def hash_i(*parts):
    value = 7
    for part in parts:
        for ch in str(part):
            value = (value * 131 + ord(ch)) % 1000003
    return value
