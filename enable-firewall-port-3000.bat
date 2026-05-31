@echo off
REM Enable port 3000 for API Gateway
"%WINDIR%\System32\netsh.exe" advfirewall firewall add rule name="Allow API Gateway Port 3000" dir=in action=allow protocol=tcp localport=3000 remoteip=192.168.100.0/24 profile=any
if errorlevel 1 (
	echo Failed to add firewall rule for port 3000
) else (
	echo Port 3000 firewall rule added successfully
)
pause
