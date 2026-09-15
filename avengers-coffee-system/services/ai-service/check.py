from sqlalchemy import create_engine, text
import os

engine = create_engine('postgresql://admin:123@postgres-db:5432/avengers_coffee')
with engine.connect() as conn:
    print('--- User Address ---')
    user = conn.execute(text('SELECT dia_chi_day_du, vi_do, kinh_do FROM identity.dia_chi_giao_hang WHERE dia_chi_day_du LIKE \'%Nguyễn Hữu Tiến%\'')).fetchall()
    print(user)
    print('--- Branches ---')
    branches = conn.execute(text('SELECT ma_chi_nhanh, ten_chi_nhanh, vi_do, kinh_do FROM identity.chi_nhanh WHERE ten_chi_nhanh LIKE \'%Hoang Dieu%\' OR ten_chi_nhanh LIKE \'%Trường Chinh%\' OR ten_chi_nhanh LIKE \'%Tân Kỳ%\'')).fetchall()
    for b in branches:
        print(b)
