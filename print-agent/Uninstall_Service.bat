@echo off
setlocal enabledelayedexpansion
title Uninstall Isra POS Print Agent Scheduled Task

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Run as Administrator required.
    pause
    exit /b 1
)

set "TASK_NAME=IsraPOS_PrintAgent"

taskkill /f /im IsraPrintAgent.exe >nul 2>&1
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

if %errorLevel% equ 0 (
    echo [SUCCESS] Print Agent scheduled task removed.
) else (
    echo [INFO] No task found to remove (may already be uninstalled).
)

echo.
pause
