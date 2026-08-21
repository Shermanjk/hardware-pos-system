@echo off
title Isra POS Hardware Print Agent
cd /d "%~dp0"

:: Auto-kill any leftover process on port 18181
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18181" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Launch the standalone EXE directly
if exist "%~dp0IsraPrintAgent.exe" (
    "%~dp0IsraPrintAgent.exe"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent.ps1"
)
pause
