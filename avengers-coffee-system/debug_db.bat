@echo off
docker exec avengers_postgres psql -U postgres -d avengers_db -c "SELECT sp.ma_san_pham, sp.ten_san_pham, sp.ma_danh_muc, dg.so_sao FROM menu.san_pham sp JOIN orders.danh_gia_san_pham dg ON sp.ma_san_pham::text = dg.ma_san_pham::text;"
