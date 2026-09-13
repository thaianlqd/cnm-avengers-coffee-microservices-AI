import os

pages_dir = os.path.join(os.path.dirname(__file__), 'pages')

rename_map = {
    '01_Tổng_Quan.py': '01_Tong_Quan.py',
    '03_Sản_Phẩm.py': '03_San_Pham.py',
    '04_Khách_Hàng.py': '04_Khach_Hang.py',
    '05_Shipper_Giao_Hàng.py': '05_Shipper_Giao_Hang.py',
    '06_Trí_Tuệ_Nhân_Tạo.py': '06_Tri_Tue_Nhan_Tao.py',
    '07_Khẩu_Vị_Sở_Thích.py': '07_Khau_Vi_So_Thich.py',
    '08_Phân_Tích_Chuyên_Sâu.py': '08_Phan_Tich_Chuyen_Sau.py',
    '09_Kiến_Trúc_Hệ_Thống.py': '09_Kien_Truc_He_Thong.py',
    '10_Đối_Soát_Dòng_Tiền.py': '10_Doi_Soat_Dong_Tien.py',
    '11_Sức_Khoẻ_Nhượng_Quyền.py': '11_Suc_Khoe_Nhuong_Quyen.py'
}

print(f"Bắt đầu đổi tên TRỞ LẠI không dấu trong thư mục: {pages_dir}")
for old_name, new_name in rename_map.items():
    old_path = os.path.join(pages_dir, old_name)
    new_path = os.path.join(pages_dir, new_name)
    if os.path.exists(old_path) and old_name != new_name:
        os.rename(old_path, new_path)
        print(f"✅ Đã đổi tên: {old_name} -> {new_name}")

print("Đổi tên trở lại không dấu hoàn tất!")
