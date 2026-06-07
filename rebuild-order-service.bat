@echo off
echo ==========================================
echo   BUILD LAI order-service + web-admin
echo ==========================================
echo.

cd /d "c:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI"

echo [1/2] Build lai tu source code moi (--no-cache)...
docker compose build --no-cache order-service web-admin

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ===== BUILD THAT BAI! =====
    pause
    exit /b 1
)

echo.
echo [2/2] Restart service...
docker compose up -d order-service web-admin

echo.
echo ==========================================
echo   XONG! Doi 30s roi test lai
echo   1. Web Admin: Bam "Ban giao Shipper"
echo   2. Shipper App: Don hien trong 20s
echo ==========================================
pause
