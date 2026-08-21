@echo off
title Isra POS Hardware Print Agent
cd /d "%~dp0"

:: Automatically free port 18181 if a previous instance is already running
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18181" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Starting Isra POS Native Hardware Print Agent on http://127.0.0.1:18181...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent.ps1"
pause
