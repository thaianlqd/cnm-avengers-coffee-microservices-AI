param(
  [string]$Container = "avengers_db",
  [string]$Database = "avengers_coffee",
  [string]$User = "admin",
  [int]$Days = 30,
  [int]$MinOrders = 180,
  [int]$TargetOrders = 260,
  [string]$BranchCode = "MAC_DINH_CHI"
)

$ErrorActionPreference = "Stop"

$sql = @"
DO `$$
DECLARE
  v_days int := $Days;
  v_min_orders int := $MinOrders;
  v_target_orders int := $TargetOrders;
  v_branch text := '$BranchCode';
  v_existing_orders int;
  v_to_insert int;
  v_user_ids text[];
  v_user_count int;
  v_order_id uuid;
  v_user_id text;
  v_order_ts timestamp;
  v_payment text;
  v_item_count int;
  v_item_idx int;
  v_product_id int;
  v_product_name text;
  v_product_price numeric;
  v_product_image text;
  v_qty int;
  v_subtotal numeric;
  v_discount numeric;
  v_final_total numeric;
  v_has_voucher boolean;
  v_voucher_code text;
  v_rating int;
  i int;
  r double precision;
BEGIN
  SELECT COUNT(*)
  INTO v_existing_orders
  FROM orders.don_hang
  WHERE ngay_tao >= NOW() - make_interval(days => v_days);

  IF v_existing_orders >= v_min_orders THEN
    RAISE NOTICE 'Skip seeding. Existing orders in last % days: % (threshold: %).', v_days, v_existing_orders, v_min_orders;
    RETURN;
  END IF;

  v_to_insert := GREATEST(v_target_orders - v_existing_orders, 0);

  SELECT ARRAY_AGG(DISTINCT ma_nguoi_dung)
  INTO v_user_ids
  FROM orders.don_hang
  WHERE ma_nguoi_dung ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  IF v_user_ids IS NULL OR ARRAY_LENGTH(v_user_ids, 1) IS NULL THEN
    v_user_ids := ARRAY[
      uuid_generate_v4()::text,
      uuid_generate_v4()::text,
      uuid_generate_v4()::text,
      uuid_generate_v4()::text,
      uuid_generate_v4()::text,
      uuid_generate_v4()::text,
      uuid_generate_v4()::text,
      uuid_generate_v4()::text
    ];
  END IF;

  IF ARRAY_LENGTH(v_user_ids, 1) < 24 THEN
    FOR i IN 1..(24 - ARRAY_LENGTH(v_user_ids, 1)) LOOP
      v_user_ids := ARRAY_APPEND(v_user_ids, uuid_generate_v4()::text);
    END LOOP;
  END IF;

  v_user_count := ARRAY_LENGTH(v_user_ids, 1);

  FOR i IN 1..v_to_insert LOOP
    v_order_id := uuid_generate_v4();
    v_user_id := v_user_ids[1 + FLOOR(random() * v_user_count)::int];

    v_order_ts := NOW()
      - make_interval(days => FLOOR(random() * v_days)::int)
      - make_interval(hours => 6 + FLOOR(random() * 17)::int)
      - make_interval(mins => FLOOR(random() * 60)::int);

    r := random();
    IF r < 0.62 THEN
      v_payment := 'THANH_TOAN_KHI_NHAN_HANG';
    ELSIF r < 0.90 THEN
      v_payment := 'NGAN_HANG_QR';
    ELSE
      v_payment := 'VNPAY';
    END IF;

    v_has_voucher := random() < 0.35;
    IF v_has_voucher THEN
      v_voucher_code := (ARRAY['GIAM10', 'WELCOME5', 'MEMBER15'])[1 + FLOOR(random() * 3)::int];
    ELSE
      v_voucher_code := NULL;
    END IF;

    INSERT INTO orders.don_hang (
      ma_don_hang,
      ma_nguoi_dung,
      tong_tien,
      dia_chi_giao_hang,
      khung_gio_giao,
      ghi_chu,
      phuong_thuc_thanh_toan,
      trang_thai_thanh_toan,
      trang_thai_don_hang,
      ma_voucher,
      so_tien_giam,
      lich_su_trang_thai,
      ngay_tao,
      ngay_cap_nhat,
      loai_don_hang,
      co_so_ma
    ) VALUES (
      v_order_id,
      v_user_id,
      0,
      'Demo seed address',
      '09:00-11:00',
      'Seeded for analytics test',
      v_payment,
      'DA_THANH_TOAN',
      'HOAN_THANH',
      v_voucher_code,
      0,
      jsonb_build_array(
        jsonb_build_object('status', 'MOI_TAO'),
        jsonb_build_object('status', 'HOAN_THANH')
      ),
      v_order_ts,
      v_order_ts,
      'MANG_DI',
      v_branch
    );

    v_subtotal := 0;
    v_item_count := 1 + FLOOR(random() * 3)::int;

    FOR v_item_idx IN 1..v_item_count LOOP
      r := random();
      IF r < 0.34 THEN
        v_product_id := 1;
      ELSIF r < 0.54 THEN
        v_product_id := 2;
      ELSIF r < 0.69 THEN
        v_product_id := 4;
      ELSIF r < 0.81 THEN
        v_product_id := 18;
      ELSIF r < 0.90 THEN
        v_product_id := 11;
      ELSIF r < 0.96 THEN
        v_product_id := 3;
      ELSE
        SELECT sp.ma_san_pham
        INTO v_product_id
        FROM menu.san_pham sp
        WHERE sp.trang_thai = TRUE
        ORDER BY random()
        LIMIT 1;
      END IF;

      SELECT
        sp.ten_san_pham,
        COALESCE(sp.gia_ban, 0),
        COALESCE(sp.hinh_anh_url, '')
      INTO
        v_product_name,
        v_product_price,
        v_product_image
      FROM menu.san_pham sp
      WHERE sp.ma_san_pham = v_product_id
      LIMIT 1;

      IF v_product_name IS NULL THEN
        CONTINUE;
      END IF;

      v_qty := 1 + FLOOR(random() * 3)::int;
      v_subtotal := v_subtotal + (v_product_price * v_qty);

      INSERT INTO orders.chi_tiet_don_hang (
        ma_don_hang,
        ma_san_pham,
        ten_san_pham,
        gia_ban,
        so_luong,
        kich_co,
        hinh_anh_url
      ) VALUES (
        v_order_id,
        v_product_id,
        v_product_name,
        v_product_price,
        v_qty,
        'M',
        v_product_image
      );

      IF random() < 0.16 THEN
        INSERT INTO orders.yeu_thich_san_pham (
          ma_nguoi_dung,
          ma_san_pham,
          ten_san_pham,
          gia_ban,
          hinh_anh_url,
          danh_muc,
          ngay_tao
        ) VALUES (
          v_user_id,
          v_product_id::text,
          v_product_name,
          v_product_price,
          v_product_image,
          'Seed analytics',
          v_order_ts
        )
        ON CONFLICT (ma_nguoi_dung, ma_san_pham) DO NOTHING;
      END IF;

      IF random() < 0.11 THEN
        r := random();
        IF r < 0.55 THEN
          v_rating := 5;
        ELSIF r < 0.86 THEN
          v_rating := 4;
        ELSIF r < 0.96 THEN
          v_rating := 3;
        ELSE
          v_rating := 2;
        END IF;

        INSERT INTO orders.danh_gia_san_pham (
          ma_san_pham,
          ma_nguoi_dung,
          so_sao,
          binh_luan,
          ma_don_hang,
          ngay_tao,
          ngay_cap_nhat
        ) VALUES (
          v_product_id::text,
          v_user_id::uuid,
          v_rating,
          'Seeded review for analytics test',
          v_order_id,
          v_order_ts,
          v_order_ts
        );
      END IF;
    END LOOP;

    IF v_subtotal <= 0 THEN
      DELETE FROM orders.don_hang WHERE ma_don_hang = v_order_id;
      CONTINUE;
    END IF;

    IF v_has_voucher THEN
      v_discount := ROUND((v_subtotal * (0.10 + random() * 0.15))::numeric, 2);
    ELSE
      v_discount := 0;
    END IF;

    v_final_total := GREATEST(v_subtotal - v_discount, 0);

    UPDATE orders.don_hang
    SET
      tong_tien = v_final_total,
      so_tien_giam = v_discount,
      ngay_cap_nhat = v_order_ts
    WHERE ma_don_hang = v_order_id;
  END LOOP;

  RAISE NOTICE 'Seeded % new orders for behavior analytics (existing before seed: %, target: %).', v_to_insert, v_existing_orders, v_target_orders;
END
`$$;
"@

Write-Host "Seeding behavior analytics data when recent orders are below threshold..." -ForegroundColor Cyan
docker exec $Container psql -U $User -d $Database -v ON_ERROR_STOP=1 -c $sql
if ($LASTEXITCODE -ne 0) {
  throw "Seed command failed with exit code $LASTEXITCODE"
}
Write-Host "Done." -ForegroundColor Green
