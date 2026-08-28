@echo off
title Isra POS Hardware Print Agent
cd /d "%~dp0"

:: Auto-kill any leftover print agent processes
taskkill /f /im "IsraPrintAgent.exe" >nul 2>&1
for %%p in (18181 18182 18183 18184) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p" ^| findstr "LISTENING"') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul

:: Launch the standalone EXE directly
if exist "%~dp0IsraPrintAgent.exe" (
    "%~dp0IsraPrintAgent.exe"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent.ps1"
)
pause
