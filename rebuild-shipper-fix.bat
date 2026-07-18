@echo off
echo ================================================
echo  REBUILD ORDER-SERVICE (Fix Shipper Pool Logic)
echo ================================================
echo.

cd /d "C:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI"

echo [1/2] Dung container cu...
docker compose stop order-service

echo [2/2] Build lai va khoi dong...
docker compose up -d --build order-service

echo.
echo ====== HOAN THANH! ======
echo Cho 20 giay de order-service khoi dong xong.
echo Sau do test theo thu tu:
echo.
echo BUOC 1: Web Admin (localhost:5174)
echo  - Vao "Quan ly Giao hang" (Staff Dashboard)
echo  - Tim don DANG_CHUAN_BI hoac DANG_GIAO
echo  - Bam nut "Shipper Noi Bo" de push don vao pool
echo.
echo BUOC 2: Shipper App (localhost:8081)
echo  - Dang nhap bang tai khoan shipper
echo  - Bam "Lam moi" - Don hang se hien ra!
echo  - Bam vao don -> Nhan don -> Lay hang -> Giao hang
echo.
pause
