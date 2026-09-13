#!/usr/bin/env python3
"""
=============================================================
Avengers Coffee — Enterprise Big Data Generator v3.1 (REAL DB MODE)
=============================================================
Đọc danh sách cơ sở THẬT từ Supabase và sinh đơn hàng Big Data:
  - identity.chi_nhanh: 1164 cửa hàng tự doanh (Main Stores)
  - franchise.kiosk: 13 kiosk nhượng quyền (Kiosk)
  - menu.san_pham: Danh sách sản phẩm thật
=============================================================
"""
import os, uuid, random, logging, json
from datetime import datetime, timedelta, date
from typing import List, Dict

import numpy as np
import psycopg2
from psycopg2.extras import execute_values, RealDictCursor
from dotenv import load_dotenv

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("real_db_gen")
load_dotenv()

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com"),
    "port":     int(os.getenv("DB_PORT", 6543)),
    "user":     os.getenv("DB_USER", "postgres.seneuycwihbyqjdtcdvu"),
    "password": os.getenv("DB_PASSWORD", ""), # User needs to make sure this is in .env
    "dbname":   os.getenv("DB_NAME", "postgres"),
}

TOTAL_ORDERS  = 2_000_000
BATCH_SIZE    = 5_000
MONTHS_BACK   = 12
FRAUD_RATE    = 0.009
COD_HOLD_RATE = 0.003

# =================================================================
# DDL (Chỉ tạo các schema/table phụ trợ chưa có)
# =================================================================
DDL = """
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS context;

CREATE TABLE IF NOT EXISTS finance.hop_dong_nq (
    ma_hop_dong UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    co_so_ma VARCHAR(100), franchisee_ten TEXT, von_dau_tu_vnd BIGINT,
    phi_nhuong_quyen_pct DECIMAL(5,2) DEFAULT 7.00,
    phi_thuong_hieu_pct DECIMAL(5,2) DEFAULT 2.00,
    ngay_ky DATE, thoi_han_thang SMALLINT, ngay_het_han DATE,
    trang_thai VARCHAR(20) DEFAULT 'ACTIVE'
);
CREATE TABLE IF NOT EXISTS finance.chi_phi_van_hanh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    co_so_ma VARCHAR(100), ky_ke_toan DATE,
    chi_phi_cogs BIGINT, chi_phi_mat_bang BIGINT,
    chi_phi_luong BIGINT, chi_phi_logistics BIGINT, chi_phi_marketing BIGINT
);
CREATE TABLE IF NOT EXISTS context.thoi_tiet_ngay (
    ngay DATE NOT NULL, cum_vung VARCHAR(10) NOT NULL,
    nhiet_do_tb DECIMAL(4,1), luong_mua_mm DECIMAL(6,1),
    trang_thai VARCHAR(20), is_holiday BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (ngay, cum_vung)
);
"""

def load_real_data(conn):
    log.info("Loading REAL DATA from Supabase...")
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 1. Load Main Stores
    cur.execute("SELECT ma_chi_nhanh as ma, ten_chi_nhanh as ten, thanh_pho FROM identity.chi_nhanh")
    mains = cur.fetchall()
    for m in mains: m['type'] = 'MAIN_STORE'
    
    # 2. Load Kiosks
    cur.execute("SELECT ma_kiosk as ma, ten_kiosk as ten, thanh_pho FROM franchise.kiosk")
    kiosks = cur.fetchall()
    for k in kiosks: k['type'] = 'KIOSK'
    
    # 3. Load Products
    cur.execute("SELECT ma_san_pham as ma, ten_san_pham as ten, gia_ban FROM menu.san_pham WHERE gia_ban IS NOT NULL")
    products = cur.fetchall()
    
    cur.close()
    return mains, kiosks, products

def build_contracts(kiosks):
    out = []
    for k in kiosks:
        von = random.randint(400_000_000, 1_500_000_000)
        ngay_ky = (datetime.now() - timedelta(days=random.randint(300, 1200))).date()
        thoi_han = random.choice([24, 36, 48, 60])
        out.append({
            "co_so_ma": k["ma"], "franchisee_ten": f"DoiTac-{random.randint(100, 999)}",
            "von_dau_tu_vnd": von, "phi_nhuong_quyen_pct": 7.00, "phi_thuong_hieu_pct": 2.00,
            "ngay_ky": ngay_ky.isoformat(), "thoi_han_thang": thoi_han,
            "ngay_het_han": (ngay_ky + timedelta(days=thoi_han*30)).isoformat(), "trang_thai": "ACTIVE"
        })
    return out

def build_costs(stores):
    all_c = []; today = date.today()
    for s in stores:
        mb = random.randint(10_000_000, 50_000_000)
        lu = random.randint(15_000_000, 45_000_000)
        log_b = random.randint(5_000_000, 15_000_000)
        for m in range(MONTHS_BACK):
            ky = (today.replace(day=1) - timedelta(days=m*30)).replace(day=1)
            sm = 1.2 if ky.month in [6,7,8] else 1.0
            rev = random.randint(100_000_000, 500_000_000) * sm
            all_c.append({
                "co_so_ma": s["ma"], "ky_ke_toan": ky.isoformat(),
                "chi_phi_cogs": int(rev * random.uniform(0.28, 0.35)),
                "chi_phi_mat_bang": int(mb * random.uniform(0.95, 1.05)),
                "chi_phi_luong": int(lu * random.uniform(0.9, 1.1)),
                "chi_phi_logistics": int(log_b * random.uniform(0.8, 1.2) * sm),
                "chi_phi_marketing": random.randint(2_000_000, 15_000_000)
            })
    return all_c

def build_weather():
    records = []; today = date.today()
    for d_back in range(MONTHS_BACK*30+30):
        day = today - timedelta(days=d_back)
        for vung in ["Bac", "Trung", "Nam"]:
            mp = 0.5
            rr = random.random()
            if rr < mp * 0.1: tt = "BAO"; lm = random.uniform(80, 200)
            elif rr < mp * 0.4: tt = "MUA_TO"; lm = random.uniform(30, 80)
            elif rr < mp: tt = "MUA_NHO"; lm = random.uniform(5, 30)
            else: tt = "NANG"; lm = 0.0
            records.append({
                "ngay": day.isoformat(), "cum_vung": vung, "nhiet_do_tb": round(random.uniform(20, 36), 1),
                "luong_mua_mm": round(lm, 1), "trang_thai": tt, "is_holiday": False
            })
    return records

def gen_order(store, products, is_fraud=False, is_cod=False):
    ma = str(uuid.uuid4())
    n_items = max(1, min(5, int(np.random.poisson(1.5))))
    items = random.choices(products, k=n_items)
    tong = sum(float(i['gia_ban']) for i in items)
    giam = round(tong * 0.1) if random.random() < 0.2 else 0
    tong = max(0, tong - giam)

    is_k = store["type"] == "KIOSK"
    days_back = random.randint(0, MONTHS_BACK*30)
    base = datetime.now() - timedelta(days=days_back)
    
    hour = random.randint(7, 21)
    ts = base.replace(hour=hour, minute=random.randint(0,59), second=random.randint(0,59), microsecond=0)
    
    loai = "DELIVERY" if is_k and random.random() < 0.3 else random.choice(["DINE_IN", "TAKE_AWAY"])
    ptt = "COD" if is_cod or (loai == "DELIVERY" and random.random() < 0.4) else random.choice(["TIEN_MAT", "NGAN_HANG"])
    
    if is_fraud: 
        tt = "DA_HUY"; ts = ts.replace(hour=random.choice([22,23])); tttt = "HOAN_TIEN"
    elif is_cod: 
        tt = "HOAN_THANH"; tttt = "CHO_THANH_TOAN"; ptt = "COD"
    else:
        tt = random.choices(["HOAN_THANH", "DA_HUY"], weights=[0.92, 0.08])[0]
        tttt = "DA_THANH_TOAN" if tt == "HOAN_THANH" else "CHO_THANH_TOAN"

    order = {
        "ma_don_hang": ma, "ma_nguoi_dung": None,
        "co_so_ma": store["ma"], "tong_tien": round(tong, 2),
        "dia_chi_giao_hang": f"{store['ten']}, {store['thanh_pho']}",
        "khung_gio_giao": None, "ghi_chu": None, "loai_don_hang": loai,
        "ma_ban": None, "ten_khach_hang": f"Khach {random.randint(1000,9999)}",
        "ten_thu_ngan": "Auto", "phuong_thuc_thanh_toan": ptt,
        "trang_thai_thanh_toan": tttt, "trang_thai_don_hang": tt,
        "ma_voucher": "VC10" if giam > 0 else None,
        "so_tien_giam": round(giam, 2), "tien_khach_dua": None, "tien_thoi": None,
        "lich_su_trang_thai": json.dumps([{"tt": tt, "t": ts.isoformat()}]),
        "ngay_tao": ts, "ngay_cap_nhat": ts + timedelta(minutes=random.randint(5, 60))
    }
    
    details = []
    for it in items:
        details.append({
            "ma_don_hang": ma, "ma_san_pham": int(it['ma']), "ten_san_pham": it['ten'],
            "gia_ban": float(it['gia_ban']), "so_luong": 1, "kich_co": "M",
            "hinh_anh_url": None, "toppings": "[]"
        })
    return order, details

def ins_batch(conn, sql, data, ps=500):
    if not data: return
    c = conn.cursor()
    for i in range(0, len(data), 5000):
        execute_values(c, sql, data[i:i+5000], page_size=ps)
    conn.commit()
    c.close()

def flush_orders(conn, bo, bd):
    if not bo: return
    o_c = ["ma_don_hang","ma_nguoi_dung","co_so_ma","tong_tien","dia_chi_giao_hang",
         "khung_gio_giao","ghi_chu","loai_don_hang","ma_ban","ten_khach_hang",
         "ten_thu_ngan","phuong_thuc_thanh_toan","trang_thai_thanh_toan",
         "trang_thai_don_hang","ma_voucher","so_tien_giam","tien_khach_dua",
         "tien_thoi","lich_su_trang_thai","ngay_tao","ngay_cap_nhat"]
    d_c = ["ma_don_hang","ma_san_pham","ten_san_pham","gia_ban","so_luong","kich_co","hinh_anh_url","toppings"]
    c = conn.cursor()
    execute_values(c, f"INSERT INTO orders.don_hang ({','.join(o_c)}) VALUES %s ON CONFLICT (ma_don_hang) DO NOTHING",
                   [tuple(x[col] for col in o_c) for x in bo], page_size=500)
    if bd:
        execute_values(c, f"INSERT INTO orders.chi_tiet_don_hang ({','.join(d_c)}) VALUES %s",
                       [tuple(x.get(col, None) for col in d_c) for x in bd], page_size=500)
    conn.commit()
    c.close()

def main():
    log.info("="*65)
    log.info(f"  Avengers Coffee Enterprise Generator v3.1 (REAL DB MODE)")
    log.info(f"  Target: {TOTAL_ORDERS:,} orders mapping to REAL Stores & Products")
    log.info("="*65)

    conn = psycopg2.connect(**DB_CONFIG)
    mains, kiosks, products = load_real_data(conn)
    stores = mains + kiosks
    
    log.info(f"  Found {len(mains)} Main Stores, {len(kiosks)} Kiosks, {len(products)} Products in Supabase!")
    if not stores or not products:
        log.error("Missing stores or products. Aborting.")
        return

    cur = conn.cursor(); cur.execute(DDL); conn.commit(); cur.close()

    contracts = build_contracts(kiosks)
    costs = build_costs(stores)
    weather = build_weather()

    c_c = ["co_so_ma","franchisee_ten","von_dau_tu_vnd","phi_nhuong_quyen_pct",
          "phi_thuong_hieu_pct","ngay_ky","thoi_han_thang","ngay_het_han","trang_thai"]
    ins_batch(conn, f"INSERT INTO finance.hop_dong_nq ({','.join(c_c)}) VALUES %s ON CONFLICT DO NOTHING",
              [tuple(c[x] for x in c_c) for c in contracts])
    
    c_cp = ["co_so_ma","ky_ke_toan","chi_phi_cogs","chi_phi_mat_bang","chi_phi_luong","chi_phi_logistics","chi_phi_marketing"]
    ins_batch(conn, f"INSERT INTO finance.chi_phi_van_hanh ({','.join(c_cp)}) VALUES %s",
              [tuple(c[x] for x in c_cp) for c in costs])
    
    c_w = ["ngay","cum_vung","nhiet_do_tb","luong_mua_mm","trang_thai","is_holiday"]
    ins_batch(conn, f"INSERT INTO context.thoi_tiet_ngay ({','.join(c_w)}) VALUES %s ON CONFLICT DO NOTHING",
              [tuple(w[x] for x in c_w) for w in weather])

    log.info(f"  Generating {TOTAL_ORDERS:,} REALISTIC orders...")
    
    n_k = int(TOTAL_ORDERS * 0.15) if kiosks else 0
    n_m = TOTAL_ORDERS - n_k
    
    jobs = []
    if mains:
        jobs.extend([(random.choice(mains), False, False) for _ in range(n_m)])
    if kiosks:
        for _ in range(n_k):
            f = random.random() < FRAUD_RATE
            c_ = not f and random.random() < COD_HOLD_RATE
            jobs.append((random.choice(kiosks), f, c_))
            
    random.shuffle(jobs)

    total = fraud = cod = 0
    bo = []; bd = []
    
    itr = enumerate(jobs)
    if HAS_TQDM:
        itr = enumerate(tqdm(jobs, desc="Orders", unit="orders", ncols=85))
        
    for _, (store, f, c_) in itr:
        o, d = gen_order(store, products, f, c_)
        bo.append(o); bd.extend(d)
        fraud += int(f); cod += int(c_)
        if len(bo) >= BATCH_SIZE:
            flush_orders(conn, bo, bd)
            total += len(bo); bo.clear(); bd.clear()
            if not HAS_TQDM: log.info(f"  {total:,}/{TOTAL_ORDERS:,}")
            
    flush_orders(conn, bo, bd)
    total += len(bo)
    conn.close()

    log.info("="*65)
    log.info(f"  DONE! {total:,} orders for {len(stores)} REAL stores.")
    log.info(f"  Gian lan: {fraud:,} | COD Treo: {cod:,}")
    log.info("="*65)

if __name__=="__main__":
    main()
