@echo off
setlocal enabledelayedexpansion
title Disable POS Kiosk Autostart

echo ======================================================
echo       Disable POS Kiosk Autostart
echo ======================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\IsraPOS_Kiosk.lnk"
set "COMMON_STARTUP=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup\IsraPOS_Kiosk.lnk"

set DELETED=0

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%"
    set DELETED=1
)

if exist "%COMMON_STARTUP%" (
    del /f /q "%COMMON_STARTUP%"
    set DELETED=1
)

if %DELETED% equ 1 (
    echo [SUCCESS] POS Kiosk Autostart shortcut has been removed.
    echo The POS will no longer launch automatically on Windows boot.
) else (
    echo [INFO] No autostart shortcut found in the Startup folder.
)

echo.
pause
