@echo off
echo ====================================================
echo  BUILD LAI order-service + web-admin (fix delivery)
echo ====================================================
echo.

cd /d "C:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI"

echo [1/2] Build lai images...
docker compose build order-service web-admin

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ===== BUILD THAT BAI! Kiem tra log o tren =====
    pause
    exit /b 1
)

echo.
echo [2/2] Restart cac service...
docker compose up -d order-service web-admin

echo.
echo ===== HOAN THANH! Server dang khoi dong lai =====
echo Cho khoang 15 giay roi F5 trang web
pause
