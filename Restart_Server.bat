@echo off
echo ===================================================
echo   Restarting Isra POS Server (Windows Service)
echo ===================================================
echo.

:: Check for admin rights and auto-elevate
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c net stop IsraPOSServer && net start IsraPOSServer && echo. && echo Server restarted successfully! && timeout /t 3' -Verb RunAs"
    exit /b
)

echo Stopping IsraPOSServer...
net stop IsraPOSServer
echo Starting IsraPOSServer...
net start IsraPOSServer

echo.
echo ===================================================
echo   Isra POS Server restarted successfully!
echo ===================================================
echo.
timeout /t 3
