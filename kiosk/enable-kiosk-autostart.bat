@echo off
setlocal enabledelayedexpansion
title Enable POS Kiosk Autostart on Boot

echo ======================================================
echo       Enable POS Kiosk Autostart on Boot
echo ======================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER_VBS=%SCRIPT_DIR%Launch_POS_Kiosk_Silent.vbs"
set "LAUNCHER_BAT=%SCRIPT_DIR%Launch_POS_Kiosk.bat"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\IsraPOS_Kiosk.lnk"

:: Prefer silent VBS launcher if present, otherwise fallback to BAT
if exist "%LAUNCHER_VBS%" (
    set "TARGET_FILE=%LAUNCHER_VBS%"
) else if exist "%LAUNCHER_BAT%" (
    set "TARGET_FILE=%LAUNCHER_BAT%"
) else (
    echo [ERROR] Launch_POS_Kiosk.bat not found in "%SCRIPT_DIR%"!
    echo.
    pause
    exit /b 1
)

echo Target: "%TARGET_FILE%"
echo Startup Location: "%STARTUP_FOLDER%"
echo.

:: Create shortcut via PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
    "$s.TargetPath = '%TARGET_FILE%'; " ^
    "$s.WorkingDirectory = '%SCRIPT_DIR%'; " ^
    "$s.Description = 'Isra POS Kiosk Autostart'; " ^
    "if (Test-Path '%SCRIPT_DIR%icon.ico') { $s.IconLocation = '%SCRIPT_DIR%icon.ico'; } " ^
    "$s.WindowStyle = 7; " ^
    "$s.Save()"

if %errorLevel% equ 0 (
    echo [SUCCESS] POS Kiosk Autostart has been enabled!
    echo The POS Kiosk will now launch automatically when this PC turns on / logs in.
    echo.
    echo Shortcut created at:
    echo "%SHORTCUT_PATH%"
) else (
    echo [ERROR] Failed to create shortcut in Startup folder.
)

echo.
echo ======================================================
echo Tip: To ensure Windows boots directly into the POS without
echo stopping at a login screen, press Win+R, type "netplwiz",
echo and uncheck "Users must enter a user name and password".
echo ======================================================
echo.
pause
