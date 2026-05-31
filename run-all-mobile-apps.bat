@echo off
REM Run all 3 mobile apps simultaneously with Expo
REM This script opens 3 PowerShell windows, one for each app

cd /d "C:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI\avengers-coffee-system\apps"

echo Starting 3 Mobile Apps...
echo.

REM Start Shipper Mobile in new window (Port 8081)
echo Launching Shipper Mobile (port 8081)...
start "Shipper Mobile" powershell -NoExit -Command {cd shipper-mobile; npx expo start --clear}

timeout /t 3

REM Start Customer Mobile in new window (Port 8082)
echo Launching Customer Mobile (port 8082)...
start "Customer Mobile" powershell -NoExit -Command {cd customer-mobile; npx expo start --clear}

timeout /t 3

REM Start Admin Mobile in new window (Port 8083)
echo Launching Admin Mobile (port 8083)...
start "Admin Mobile" powershell -NoExit -Command {cd admin-mobile; npx expo start --clear}

echo.
echo All 3 apps are starting!
echo Check the 3 PowerShell windows for QR codes
echo.
pause
