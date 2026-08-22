@echo off
setlocal enabledelayedexpansion
title Install Isra POS Print Agent as Windows Scheduled Task

echo ============================================================
echo   Isra POS Print Agent - Windows Task Scheduler Installer
echo ============================================================
echo.
echo   This will register IsraPrintAgent.exe to run automatically
echo   at Windows startup (even before user login).
echo.

:: Require Admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    echo   Right-click this .bat file and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

set "TARGET_EXE=%~dp0IsraPrintAgent.exe"
set "TASK_NAME=IsraPOS_PrintAgent"

:: Remove any existing task first (ignore errors)
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: Create task: runs at system startup, as SYSTEM account, with highest privileges
:: /SC ONSTART  = triggers at every Windows startup
:: /RU SYSTEM   = runs as the SYSTEM account (no login required)
:: /RL HIGHEST  = runs with highest available privileges
:: /F           = force create (overwrite if exists)
schtasks /Create ^
    /TN "%TASK_NAME%" ^
    /TR "\"%TARGET_EXE%\"" ^
    /SC ONSTART ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F

if %errorLevel% equ 0 (
    echo.
    echo [SUCCESS] Print Agent registered as Windows Scheduled Task!
    echo.
    echo   Task Name : %TASK_NAME%
    echo   Trigger   : At system startup (before login)
    echo   Runs As   : SYSTEM (no CMD window, fully silent)
    echo   EXE Path  : %TARGET_EXE%
    echo.
    echo   Starting the print agent now...
    schtasks /Run /TN "%TASK_NAME%"
    echo.
    echo ============================================================
    echo   Setup Complete!
    echo   The Print Agent will now start automatically on every boot.
    echo   No CMD window will be visible - it runs silently.
    echo ============================================================
) else (
    echo.
    echo [ERROR] Failed to register scheduled task.
    echo   Make sure you are running this as Administrator.
)

echo.
pause
