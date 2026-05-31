@echo off
REM Run this as Administrator to open ports for mobile development
set "NETSH=%WINDIR%\System32\netsh.exe"

echo Opening firewall ports for mobile development...

REM Port 8081 for Expo dev server
"%NETSH%" advfirewall firewall add rule name="Allow Expo Port 8081" dir=in action=allow protocol=tcp localport=8081 profile=any remoteip=192.168.100.0/24
if errorlevel 1 (
	echo Failed to open port 8081
) else (
	echo Port 8081 opened for Expo dev server
)

REM Port 3000 for API Gateway
"%NETSH%" advfirewall firewall add rule name="Allow API Gateway Port 3000" dir=in action=allow protocol=tcp localport=3000 profile=any remoteip=192.168.100.0/24
if errorlevel 1 (
	echo Failed to open port 3000
) else (
	echo Port 3000 opened for API Gateway
)

echo.
echo ===== FIREWALL RULES ADDED =====
echo Port 8081: Expo dev server
echo Port 3000: API Gateway
echo.
echo Close the terminal and try scanning QR code again on iPhone
pause
