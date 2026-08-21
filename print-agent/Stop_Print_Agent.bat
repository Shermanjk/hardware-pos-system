@echo off
title Stop Isra POS Print Agent

echo Stopping Isra POS Print Agent on port 18181...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18181" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a
    echo Terminated Print Agent process [PID: %%a]
)
echo.
echo Print Agent stopped.
timeout /t 3 >nul
