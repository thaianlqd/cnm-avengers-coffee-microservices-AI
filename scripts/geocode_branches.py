import os
import sys
import time
import httpx
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load biến môi trường từ file .env ở thư mục gốc
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

def get_db_engine():
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    user = os.getenv("DB_USER", "admin")
    password = os.getenv("DB_PASSWORD", "123")
    dbname = os.getenv("DB_NAME", "avengers_coffee")
    url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}?sslmode=require"
    return create_engine(url)

def geocode_address(address: str, api_key: str):
    try:
        search_url = "https://maps.vietmap.vn/api/search/v3"
        search_params = {
            "apikey": api_key,
            "text": address.strip()
        }
        with httpx.Client(timeout=10.0) as client:
            search_resp = client.get(search_url, params=search_params)
            search_resp.raise_for_status()
            search_data = search_resp.json()
            
            if isinstance(search_data, list) and len(search_data) > 0:
                ref_id = search_data[0].get("ref_id")
                if ref_id:
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
    except Exception as e:
        print(f"  [!] Lỗi khi gọi Vietmap API cho '{address}': {e}")
    return None, None

def main():
    api_key = os.getenv("VIETMAP_API_KEY")
    if not api_key:
        print("❌ Lỗi: Không tìm thấy VIETMAP_API_KEY trong file .env")
        sys.exit(1)

    print("🚀 Bắt đầu tiến trình Geocode chi nhánh bằng Vietmap...")
    engine = get_db_engine()
    identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")

    with engine.connect() as conn:
        # Lấy các chi nhánh chưa có tọa độ
        query = text(f"""
            SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi, thanh_pho
            FROM {identity_schema}.chi_nhanh
            WHERE vi_do IS NULL OR kinh_do IS NULL
        """)
        branches = conn.execute(query).mappings().all()
        
        if not branches:
            print("✅ Toàn bộ chi nhánh đang kiểm tra đã có tọa độ! Không cần chạy lại.")
            print("💡 Mẹo: Nếu bạn muốn chạy lại một chi nhánh, hãy dùng lệnh SQL để set vi_do = NULL cho chi nhánh đó.")
            return

        print(f"📌 Tìm thấy {len(branches)} chi nhánh chưa có tọa độ. Bắt đầu xử lý...")
        
        success_count = 0
        error_count = 0

        for idx, branch in enumerate(branches):
            ma_cn = branch['ma_chi_nhanh']
            ten_cn = branch['ten_chi_nhanh']
            dia_chi = branch['dia_chi']
            thanh_pho = branch['thanh_pho'] or ''
            
            full_address = f"{dia_chi}, {thanh_pho}"
            print(f"[{idx+1}/{len(branches)}] Đang geocode: {ten_cn} - {full_address}")
            
            lat, lng = geocode_address(full_address, api_key)
            
            if lat is not None and lng is not None:
                update_query = text(f"""
                    UPDATE {identity_schema}.chi_nhanh
                    SET vi_do = :lat, kinh_do = :lng
                    WHERE ma_chi_nhanh = :ma_cn
                """)
                conn.execute(update_query, {"lat": lat, "lng": lng, "ma_cn": ma_cn})
                conn.commit()
                print(f"  -> Thành công: ({lat}, {lng})")
                success_count += 1
            else:
                print("  -> Thất bại: Không tìm thấy tọa độ.")
                error_count += 1
                
            # Nghỉ 0.5s giữa các request (Vietmap thường ko strict rate limit như LocationIQ nhưng cứ để cho an toàn)
            time.sleep(0.5)
            
        print("-" * 40)
        print("🎉 Hoàn tất quá trình Geocode!")
        print(f"✅ Thành công: {success_count}/{len(branches)}")
        if error_count > 0:
            print(f"❌ Thất bại: {error_count}/{len(branches)} (cần kiểm tra lại địa chỉ hoặc API Key)")

if __name__ == "__main__":
    main()
