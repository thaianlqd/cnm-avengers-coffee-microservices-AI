"""
Avengers Coffee - Relational Integrity, Cleansing & Seed Script
Ensures 100% referential integrity and coherent business lifecycle for all orders:
1. Audits & cleans invalid payment methods, fake shippers, and orphan delivery/tracking rows.
2. Expands and standardizes a realistic Vietnamese shipper fleet across all active provinces/cities.
3. Fixes cross-city delivery assignments: every delivery order (GIAO_TAN_NOI) is assigned to a real local shipper in the same city.
4. Generates missing delivery_tracking and shipper_delivery records so 100% of deliveries have full tracking.
5. Standardizes payment transactions (orders.giao_dich_thanh_toan) matching order totals.
6. Synchronizes customer lifetime spend (tong_chi_tieu) & loyalty points (diem_loyalty).
7. Synchronizes shipper delivery counters (total_deliveries).
"""

import os
import sys
import uuid
import random
import logging
from datetime import datetime, timedelta
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("db-aligner")

SUPABASE_CONFIG = {
    "host": os.getenv("SOURCE_DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com"),
    "port": int(os.getenv("SOURCE_DB_PORT", 6543)),
    "user": os.getenv("SOURCE_DB_USER", "postgres.seneuycwihbyqjdtcdvu"),
    "password": os.getenv("SOURCE_DB_PASSWORD", "afSMTJmSkNwOEmAT"),
    "dbname": os.getenv("SOURCE_DB_NAME", "postgres"),
    "sslmode": os.getenv("SOURCE_DB_SSLMODE", "require"),
}

CITY_PLATE_PREFIXES = {
    "Hồ Chí Minh": ["59-S2", "59-X1", "59-K3", "59-G1", "51-H1", "59-V1"],
    "Hà Nội": ["29-B1", "29-E1", "29-C1", "30-F1", "29-H1", "29-K1"],
    "Đà Nẵng": ["43-D1", "43-K1", "43-S1", "43-E1"],
    "Hải Phòng": ["15-B1", "15-D1", "15-F1"],
    "Cần Thơ": ["65-B1", "65-D1", "65-E1"],
    "Khánh Hòa": ["79-N1", "79-S1", "79-D1"],
    "Bình Dương": ["61-B1", "61-D1", "61-C1"],
    "Đồng Nai": ["60-B1", "60-F1", "60-C1"],
    "Bà Rịa - Vũng Tàu": ["72-C1", "72-D1", "72-F1"],
    "Quảng Ninh": ["14-B1", "14-P1"],
    "Thừa Thiên - Huế": ["75-B1", "75-F1"],
    "Bắc Ninh": ["99-C1", "99-G1"],
    "Kiên Giang": ["68-S1", "68-B1"],
    "Thanh Hóa": ["36-B1", "36-H1"],
    "Nghệ An": ["37-B1", "37-F1"],
    "Ninh Bình": ["35-B1"],
    "Phú Thọ": ["19-B1"],
    "Bình Định": ["77-B1"],
    "Lâm Đồng": ["49-B1", "49-D1"],
    "Đắk Lắk": ["47-B1"],
    "Hưng Yên": ["89-B1"],
    "Hải Dương": ["34-B1"],
    "Tây Ninh": ["70-B1"],
    "Tiền Giang": ["63-B1"],
    "Vĩnh Phúc": ["88-B1"],
    "Quảng Nam": ["92-B1"],
    "Vĩnh Long": ["64-B1"],
    "Bình Phước": ["93-B1"],
    "Bình Thuận": ["86-B1"],
    "Quảng Bình": ["73-B1"],
    "Quảng Ngãi": ["76-B1"],
    "Cà Mau": ["69-B1"],
    "Bắc Giang": ["98-B1"],
    "Long An": ["62-B1"],
    "Thái Bình": ["17-B1"],
    "An Giang": ["67-B1"],
    "Thái Nguyên": ["20-B1"],
    "Hậu Giang": ["95-B1"],
    "Lào Cai": ["24-B1"],
    "Phú Yên": ["78-B1"],
    "Hà Nam": ["90-B1"],
    "Hòa Bình": ["28-B1"],
    "Tuyên Quang": ["22-B1"],
    "Bến Tre": ["71-B1"],
    "Đồng Tháp": ["66-B1"],
    "Nam Định": ["18-B1"],
    "Trà Vinh": ["84-B1"],
    "Hà Tĩnh": ["38-B1"],
    "Điện Biên": ["27-B1"],
    "Quảng Trị": ["74-B1"],
    "Ninh Thuận": ["85-B1"],
    "Lạng Sơn": ["12-B1"],
    "Gia Lai": ["81-B1"],
    "Bạc Liêu": ["94-B1"],
    "Sóc Trăng": ["83-B1"],
}

VIETNAMESE_LAST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"]
VIETNAMESE_MID_NAMES = ["Văn", "Hữu", "Minh", "Quốc", "Đức", "Tuấn", "Thành", "Gia", "Bảo", "Duy", "Quang", "Đình", "Hoàng"]
VIETNAMESE_FIRST_NAMES = ["Nam", "Hùng", "Long", "Tuấn", "Kiệt", "Thịnh", "Phát", "Đạt", "Khoa", "Phúc", "Huy", "Toàn", "Trí", "Dũng", "Tùng", "Thắng", "Khôi", "Trung"]


def generate_shipper_profile(city: str, branch_code: str):
    name = f"{random.choice(VIETNAMESE_LAST_NAMES)} {random.choice(VIETNAMESE_MID_NAMES)} {random.choice(VIETNAMESE_FIRST_NAMES)}"
    prefixes = CITY_PLATE_PREFIXES.get(city, ["59-S2"])
    plate_prefix = random.choice(prefixes)
    plate = f"{plate_prefix}-{random.randint(100, 999)}.{random.randint(10, 99)}"
    phone_prefix = random.choice(["090", "091", "093", "097", "098", "088", "089", "077", "079"])
    phone = f"{phone_prefix}{random.randint(1000000, 9999999)}"
    username = f"shipper_{uuid.uuid4().hex[:6]}"
    return {
        "id": str(uuid.uuid4()),
        "username": username,
        "full_name": name,
        "phone": phone,
        "vehicle_plate": plate,
        "branch_code": branch_code,
        "status": "AVAILABLE",
        "rating": round(random.uniform(4.70, 4.98), 2),
        "total_deliveries": 0,
        "vehicle_type": "MOTORBIKE",
    }


def main():
    logger.info("Connecting to Supabase (Production DB)...")
    conn = psycopg2.connect(**SUPABASE_CONFIG)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    try:
        # ─────────────────────────────────────────────────────────────
        # 1. CLEAN INVALID PAYMENT METHODS
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 1: Standardizing payment methods in orders.don_hang...")
        cur.execute("""
            UPDATE orders.don_hang
            SET phuong_thuc_thanh_toan = CASE
                WHEN phuong_thuc_thanh_toan = 'THANH_TOAN_KHI_NHAN_HANG' THEN 'TIEN_MAT'
                WHEN phuong_thuc_thanh_toan = 'VI_DIEN_TU' THEN 'MOMO'
                WHEN phuong_thuc_thanh_toan = 'NGAN_HANG_QR' THEN 'VNPAY'
                ELSE phuong_thuc_thanh_toan
            END
            WHERE phuong_thuc_thanh_toan IN ('THANH_TOAN_KHI_NHAN_HANG', 'VI_DIEN_TU', 'NGAN_HANG_QR');
        """)
        logger.info("Updated %d invalid payment method records in don_hang.", cur.rowcount)

        cur.execute("""
            UPDATE orders.giao_dich_thanh_toan
            SET cong_thanh_toan = CASE
                WHEN cong_thanh_toan = 'THANH_TOAN_KHI_NHAN_HANG' THEN 'Tiền mặt tại quầy'
                WHEN cong_thanh_toan = 'VI_DIEN_TU' THEN 'MoMo E-Wallet'
                WHEN cong_thanh_toan = 'NGAN_HANG_QR' THEN 'VNPay QR'
                ELSE cong_thanh_toan
            END
            WHERE cong_thanh_toan IN ('THANH_TOAN_KHI_NHAN_HANG', 'VI_DIEN_TU', 'NGAN_HANG_QR');
        """)
        logger.info("Updated %d invalid payment transactions.", cur.rowcount)

        # ─────────────────────────────────────────────────────────────
        # 2. PURGE ORPHAN DATA
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 2: Purging orphan records...")
        cur.execute("""
            DELETE FROM orders.delivery_tracking
            WHERE ma_don_hang NOT IN (SELECT ma_don_hang FROM orders.don_hang);
        """)
        logger.info("Deleted %d orphan delivery_tracking records.", cur.rowcount)

        cur.execute("""
            DELETE FROM orders.shipper_delivery
            WHERE ma_don_hang NOT IN (SELECT ma_don_hang FROM orders.don_hang);
        """)
        logger.info("Deleted %d orphan shipper_delivery records.", cur.rowcount)

        cur.execute("""
            DELETE FROM orders.danh_gia_san_pham
            WHERE ma_don_hang IS NOT NULL AND ma_don_hang NOT IN (SELECT ma_don_hang FROM orders.don_hang);
        """)
        logger.info("Deleted %d orphan danh_gia_san_pham records.", cur.rowcount)

        # Fix 7 reviews pointing to non-existent branches
        cur.execute("""
            UPDATE orders.danh_gia_chi_nhanh dg
            SET ma_chi_nhanh = (
                SELECT cn.ma_chi_nhanh FROM identity.chi_nhanh cn
                WHERE cn.thanh_pho = 'Hồ Chí Minh' LIMIT 1
            )
            WHERE ma_chi_nhanh NOT IN (SELECT ma_chi_nhanh FROM identity.chi_nhanh);
        """)
        logger.info("Fixed %d orphan danh_gia_chi_nhanh records.", cur.rowcount)

        # Clean fake test shippers (reassign their deliveries first)
        cur.execute("""
            SELECT id FROM orders.shipper
            WHERE full_name ILIKE '%demo%' OR full_name ILIKE '%thai%' OR phone IN ('0900000000', '0999999998') OR vehicle_plate IS NULL;
        """)
        bad_shipper_ids = [str(r[0]) for r in cur.fetchall()]
        logger.info("Identified %d fake test shippers to purge.", len(bad_shipper_ids))

        # ─────────────────────────────────────────────────────────────
        # 3. BUILD PROVINCIAL SHIPPER FLEET
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 3: Ensuring professional, local Vietnamese shippers in all provinces...")
        cur.execute("""
            SELECT cn.thanh_pho, cn.ma_chi_nhanh, cn.ten_chi_nhanh
            FROM identity.chi_nhanh cn
            ORDER BY cn.thanh_pho, cn.ma_chi_nhanh;
        """)
        branches_by_city = {}
        for r in cur.fetchall():
            city = r["thanh_pho"] or "Hồ Chí Minh"
            if city not in branches_by_city:
                branches_by_city[city] = []
            branches_by_city[city].append(r["ma_chi_nhanh"])

        # Clean up existing valid shippers and map them by city
        cur.execute("""
            SELECT s.id, s.full_name, s.branch_code, cn.thanh_pho
            FROM orders.shipper s
            LEFT JOIN identity.chi_nhanh cn ON s.branch_code = cn.ma_chi_nhanh
            WHERE s.id::text NOT IN %s AND s.vehicle_plate IS NOT NULL;
        """, (tuple(bad_shipper_ids) if bad_shipper_ids else ('00000000-0000-0000-0000-000000000000',),))
        
        existing_shippers = cur.fetchall()
        city_shippers = {}
        for s in existing_shippers:
            c = s["thanh_pho"]
            if c:
                if c not in city_shippers:
                    city_shippers[c] = []
                city_shippers[c].append(str(s["id"]))

        # Identify cities that have delivery orders
        cur.execute("""
            SELECT DISTINCT COALESCE(cn.thanh_pho, 'Hồ Chí Minh') as city
            FROM orders.don_hang d
            JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
            WHERE d.loai_don_hang = 'GIAO_TAN_NOI';
        """)
        active_delivery_cities = [r[0] for r in cur.fetchall()]
        logger.info("Found %d active delivery cities.", len(active_delivery_cities))

        new_shippers_to_insert = []
        for city in active_delivery_cities:
            current_count = len(city_shippers.get(city, []))
            target_count = 35 if city == "Hồ Chí Minh" else (25 if city == "Hà Nội" else (10 if city in ("Đà Nẵng", "Cần Thơ", "Hải Phòng") else 4))
            needed = max(0, target_count - current_count)
            available_branches = branches_by_city.get(city, ["HC_HCM_NKKN_170"])
            
            for _ in range(needed):
                b_code = random.choice(available_branches)
                shp = generate_shipper_profile(city, b_code)
                new_shippers_to_insert.append(shp)
                if city not in city_shippers:
                    city_shippers[city] = []
                city_shippers[city].append(shp["id"])

        if new_shippers_to_insert:
            logger.info("Inserting %d new professional shippers...", len(new_shippers_to_insert))
            insert_shipper_sql = """
                INSERT INTO orders.shipper (
                    id, username, full_name, phone, vehicle_plate, branch_code, status, rating, total_deliveries, vehicle_type, created_at, updated_at
                ) VALUES (
                    %(id)s, %(username)s, %(full_name)s, %(phone)s, %(vehicle_plate)s, %(branch_code)s, %(status)s, %(rating)s, %(total_deliveries)s, %(vehicle_type)s, NOW(), NOW()
                );
            """
            cur.executemany(insert_shipper_sql, new_shippers_to_insert)

        # Delete the bad shippers now that new ones are available
        if bad_shipper_ids:
            cur.execute("DELETE FROM orders.shipper_wallet WHERE \"shipperId\" IN %s;", (tuple(bad_shipper_ids),))
            cur.execute("DELETE FROM orders.shipper_schedule WHERE \"shipperId\" IN %s;", (tuple(bad_shipper_ids),))
            cur.execute("DELETE FROM orders.shipper_exception WHERE \"shipperId\" IN %s;", (tuple(bad_shipper_ids),))
            cur.execute("DELETE FROM orders.shipper WHERE id IN %s;", (tuple(bad_shipper_ids),))
            logger.info("Successfully purged bad shippers.")

        # ─────────────────────────────────────────────────────────────
        # 4. RE-ALIGN ALL DELIVERY ORDERS (GIAO_TAN_NOI)
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 4: Aligning 100% of delivery orders with realistic local shippers...")
        cur.execute("""
            SELECT d.ma_don_hang, d.ngay_tao, d.ngay_cap_nhat, d.trang_thai_don_hang,
                   d.ten_khach_hang, COALESCE(d.guest_phone, nd.so_dien_thoai, '0901234567') as customer_phone, d.dia_chi_giao_hang,
                   d.co_so_ma, COALESCE(cn.thanh_pho, 'Hồ Chí Minh') as city,
                   cn.vi_do, cn.kinh_do,
                   sd.id as existing_sd_id, sd.shipper_id as existing_shipper_id,
                   dt.id as existing_dt_id
            FROM orders.don_hang d
            JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
            LEFT JOIN identity.nguoi_dung nd ON d.ma_nguoi_dung::text = nd.ma_nguoi_dung::text
            LEFT JOIN orders.shipper_delivery sd ON d.ma_don_hang = sd.ma_don_hang
            LEFT JOIN orders.delivery_tracking dt ON d.ma_don_hang = dt.ma_don_hang
            WHERE d.loai_don_hang = 'GIAO_TAN_NOI'
            ORDER BY d.ngay_tao ASC;
        """)
        delivery_orders = cur.fetchall()
        logger.info("Total delivery orders to align: %d", len(delivery_orders))

        sd_updates = []
        sd_inserts = []
        dt_updates = []
        dt_inserts = []

        for o in delivery_orders:
            order_id = o["ma_don_hang"]
            city = o["city"]
            order_ts = o["ngay_tao"]
            status_order = o["trang_thai_don_hang"]
            
            # Select appropriate local shipper in SAME city
            avail_shippers = city_shippers.get(city) or city_shippers.get("Hồ Chí Minh")
            chosen_shipper_id = random.choice(avail_shippers)

            sd_status = "DELIVERED" if status_order == "HOAN_THANH" else ("CANCELLED" if status_order == "DA_HUY" else "IN_TRANSIT")
            
            base_lat = float(o["vi_do"] or 10.7769)
            base_lng = float(o["kinh_do"] or 106.7009)
            dest_lat = base_lat + random.uniform(-0.025, 0.025)
            dest_lng = base_lng + random.uniform(-0.025, 0.025)
            
            assigned_at = order_ts + timedelta(minutes=random.randint(1, 3))
            picked_up_at = assigned_at + timedelta(minutes=random.randint(8, 14))
            delivered_at = picked_up_at + timedelta(minutes=random.randint(12, 22))
            delivery_fee = random.choice([15000, 18000, 20000, 25000, 30000])

            addr = o["dia_chi_giao_hang"] or f"Số {random.randint(12, 388)} đường {random.choice(['Nguyễn Huệ', 'Lê Lợi', 'Pasteur', 'Điện Biên Phủ', 'Hai Bà Trưng'])}, {city}"
            cust_name = o["ten_khach_hang"] or "Khách hàng"
            cust_phone = o["customer_phone"] or "0901234567"

            if o["existing_sd_id"]:
                sd_id = o["existing_sd_id"]
                sd_updates.append((
                    chosen_shipper_id, sd_status, addr,
                    base_lat, base_lng, dest_lat, dest_lng,
                    assigned_at, picked_up_at, delivered_at, delivery_fee,
                    sd_id
                ))
            else:
                sd_id = str(uuid.uuid4())
                sd_inserts.append((
                    sd_id, order_id, chosen_shipper_id, sd_status,
                    addr, "Giao nhanh trong 30 phút",
                    base_lat, base_lng, dest_lat, dest_lng,
                    25, picked_up_at, delivered_at, delivery_fee,
                    assigned_at, delivered_at, False
                ))

            if o["existing_dt_id"]:
                dt_updates.append((
                    sd_id, o["co_so_ma"], cust_name, cust_phone, addr,
                    delivery_fee, picked_up_at, 25,
                    o["existing_dt_id"]
                ))
            else:
                tracking_id = str(uuid.uuid4())
                tracking_code = f"TRK{order_ts.strftime('%y%m%d')}{random.randint(10000, 99999)}"
                dt_inserts.append((
                    tracking_id, order_id, "INTERNAL_SHIPPER", "MOTORBIKE",
                    o["co_so_ma"], cust_name, cust_phone, tracking_code,
                    sd_id, addr, base_lat, base_lng, dest_lat, dest_lng,
                    delivery_fee, 25, picked_up_at, order_ts, delivered_at
                ))

        if sd_updates:
            logger.info("Executing %d shipper_delivery updates...", len(sd_updates))
            psycopg2.extras.execute_batch(cur, """
                UPDATE orders.shipper_delivery
                SET shipper_id = %s,
                    status = %s,
                    delivery_address = %s,
                    pickup_latitude = %s,
                    pickup_longitude = %s,
                    delivery_latitude = %s,
                    delivery_longitude = %s,
                    assigned_at = %s,
                    picked_up_at = %s,
                    delivered_at = %s,
                    delivery_fee = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """, sd_updates, page_size=2000)

        if sd_inserts:
            logger.info("Executing %d shipper_delivery inserts...", len(sd_inserts))
            psycopg2.extras.execute_batch(cur, """
                INSERT INTO orders.shipper_delivery (
                    id, ma_don_hang, shipper_id, status,
                    delivery_address, delivery_note,
                    pickup_latitude, pickup_longitude,
                    delivery_latitude, delivery_longitude,
                    estimated_time_minutes, picked_up_at, delivered_at,
                    delivery_fee, assigned_at, updated_at, is_batched
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s
                );
            """, sd_inserts, page_size=2000)

        if dt_updates:
            logger.info("Executing %d delivery_tracking updates...", len(dt_updates))
            psycopg2.extras.execute_batch(cur, """
                UPDATE orders.delivery_tracking
                SET shipper_delivery_id = %s,
                    branch_code = %s,
                    customer_name = %s,
                    customer_phone = %s,
                    delivery_address = %s,
                    delivery_fee = %s,
                    pickup_time = %s,
                    estimated_minutes = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """, dt_updates, page_size=2000)

        if dt_inserts:
            logger.info("Executing %d delivery_tracking inserts...", len(dt_inserts))
            psycopg2.extras.execute_batch(cur, """
                INSERT INTO orders.delivery_tracking (
                    id, ma_don_hang, delivery_mode, delivery_method,
                    branch_code, customer_name, customer_phone, tracking_code,
                    shipper_delivery_id, delivery_address,
                    store_latitude, store_longitude, destination_latitude, destination_longitude,
                    delivery_fee, estimated_minutes, pickup_time, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s
                );
            """, dt_inserts, page_size=2000)

        # ─────────────────────────────────────────────────────────────
        # 5. SYNCHRONIZE PAYMENT TRANSACTIONS (orders.giao_dich_thanh_toan)
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 5: Verifying & synchronizing financial transactions...")
        cur.execute("""
            INSERT INTO orders.giao_dich_thanh_toan (
                ma_don_hang, cong_thanh_toan, ma_tham_chieu, so_tien, trang_thai, ngay_tao
            )
            SELECT 
                d.ma_don_hang,
                CASE 
                    WHEN d.phuong_thuc_thanh_toan = 'TIEN_MAT' THEN 'Tiền mặt tại quầy'
                    WHEN d.phuong_thuc_thanh_toan = 'VNPAY' THEN 'VNPay QR'
                    WHEN d.phuong_thuc_thanh_toan = 'MOMO' THEN 'MoMo E-Wallet'
                    WHEN d.phuong_thuc_thanh_toan = 'VI_AVENGERS' THEN 'Ví Avengers'
                    ELSE 'Napas Card'
                END,
                'TXN_' || TO_CHAR(d.ngay_tao, 'YYYYMMDD') || '_' || SUBSTRING(d.ma_don_hang::text, 1, 8),
                d.tong_tien,
                'SUCCESS',
                d.ngay_tao
            FROM orders.don_hang d
            LEFT JOIN orders.giao_dich_thanh_toan gd ON d.ma_don_hang = gd.ma_don_hang
            WHERE d.trang_thai_thanh_toan = 'DA_THANH_TOAN' AND gd.ma_giao_dich IS NULL;
        """)
        logger.info("Created %d missing payment transactions.", cur.rowcount)

        # ─────────────────────────────────────────────────────────────
        # 6. SYNCHRONIZE SHIPPER TOTAL DELIVERIES
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 6: Synchronizing shipper total delivery counts...")
        cur.execute("""
            UPDATE orders.shipper s
            SET total_deliveries = COALESCE(sub.cnt, 0)
            FROM (
                SELECT shipper_id, count(*) as cnt
                FROM orders.shipper_delivery
                WHERE status = 'DELIVERED'
                GROUP BY shipper_id
            ) sub
            WHERE s.id = sub.shipper_id;
        """)
        logger.info("Updated delivery counters for active shippers.")

        # ─────────────────────────────────────────────────────────────
        # 7. SYNCHRONIZE CUSTOMER LIFETIME SPEND & LOYALTY POINTS
        # ─────────────────────────────────────────────────────────────
        logger.info("Step 7: Synchronizing customer loyalty points and lifetime spend...")
        cur.execute("""
            UPDATE identity.nguoi_dung nd
            SET 
                tong_chi_tieu = COALESCE(sub.total_spent, 0),
                diem_loyalty = COALESCE(FLOOR(sub.total_spent / 10000), 0),
                diem_kha_dung = COALESCE(FLOOR(sub.total_spent / 10000), 0),
                chi_tieu_thang_nay = COALESCE(sub.month_spent, 0)
            FROM (
                SELECT 
                    d.ma_nguoi_dung,
                    SUM(d.tong_tien) as total_spent,
                    SUM(d.tong_tien) FILTER (WHERE d.ngay_tao >= DATE_TRUNC('month', NOW())) as month_spent
                FROM orders.don_hang d
                WHERE d.ma_nguoi_dung IS NOT NULL AND d.trang_thai_don_hang = 'HOAN_THANH'
                GROUP BY d.ma_nguoi_dung
            ) sub
            WHERE nd.ma_nguoi_dung::text = sub.ma_nguoi_dung::text;
        """)
        logger.info("Updated lifetime spend and loyalty for %d customers.", cur.rowcount)

        conn.commit()
        logger.info("=== TRANSACTION COMMITTED SUCCESSFULLY ===")

    except Exception as e:
        conn.rollback()
        logger.error("FATAL ERROR, TRANSACTION ROLLED BACK: %s", e)
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
