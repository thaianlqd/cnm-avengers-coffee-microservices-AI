import os

base = "c:/Users/ad/Documents/Nam4_Hocki2/cnm-avengers-coffee-microservices-AI/data-platform/streamlit-app/pages/"

files = {
    "10_Doi_Soat_Dong_Tien.py": "10_Canh_Bao_Rui_Ro.py",
    "11_Suc_Khoe_Nhuong_Quyen.py": "11_Hieu_Qua_Nhuong_Quyen.py",
    "12_PnL_Cash_Runway.py": "12_Tai_Chinh_Loi_Nhuan.py",
    "13_Kiosk_Health_Map.py": "13_Ban_Do_Cua_Hang.py"
}

for old, new in files.items():
    if os.path.exists(base + old):
        print(f"Renaming {old} -> {new}")
        os.rename(base + old, base + new)
    else:
        print(f"Skip {old}, not found")
