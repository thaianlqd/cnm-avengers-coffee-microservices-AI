@echo off
echo ============================================================
echo   AVENGERS COFFEE - DATA PLATFORM STARTUP
echo ============================================================
echo.
echo [1/3] Kiem tra main stack dang chay...
docker compose ps --format table
echo.
echo [2/3] Build data platform services...
docker compose -f docker-compose.data.yml build --no-cache

if %ERRORLEVEL% NEQ 0 (
    echo BUILD THAT BAI! Xem loi o tren.
    pause
    exit /b 1
)

echo.
echo [3/3] Khoi dong Data Platform...
docker compose -f docker-compose.data.yml up -d

echo.
echo ============================================================
echo   DATA PLATFORM DANG KHOI DONG...
echo   Doi 2-3 phut de tat ca service ready
echo.
echo   SERVICE URLS:
echo   - Streamlit:    http://localhost:8501  (Dashboard chinh)
echo   - Kafka UI:     http://localhost:8082
echo   - MinIO:        http://localhost:9001  (minioadmin / minioadmin123)
echo   - Airflow:      http://localhost:8083  (admin / admin123)
echo ============================================================
echo.
echo Nhan Enter de mo tat ca dashboards...
pause

start http://localhost:8501
start http://localhost:8082
start http://localhost:9001
start http://localhost:8083
