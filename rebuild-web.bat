@echo off
echo ==========================================
echo   Rebuilding web-admin + web-customer
echo ==========================================
cd /d "c:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI"
docker compose build web-admin web-customer
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Build OK! Restarting containers...
    docker compose up -d web-admin web-customer
    echo.
    echo Done! web-admin: http://localhost:5174
    echo         web-customer: http://localhost:5173
) else (
    echo Build FAILED! Check errors above.
)
pause
