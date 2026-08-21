@echo off
title Stop Isra POS Print Agent

echo Stopping Isra POS Print Agent...
taskkill /f /im "IsraPrintAgent.exe" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18181" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    echo Terminated Print Agent process [PID: %%a]
)
echo.
echo Print Agent stopped.
pause
