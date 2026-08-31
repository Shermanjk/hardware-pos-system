@echo off
setlocal enabledelayedexpansion
title Create Isra POS Desktop Shortcut

echo ======================================================
echo          Create Isra POS Desktop Shortcut
echo ======================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER_VBS=%SCRIPT_DIR%Launch_POS_Kiosk_Silent.vbs"
set "LAUNCHER_BAT=%SCRIPT_DIR%Launch_POS_Kiosk.bat"
set "ICON_FILE=%SCRIPT_DIR%icon.ico"

:: Prefer silent VBS launcher if present, otherwise fallback to BAT
if exist "%LAUNCHER_VBS%" (
    set "TARGET_FILE=%LAUNCHER_VBS%"
) else if exist "%LAUNCHER_BAT%" (
    set "TARGET_FILE=%LAUNCHER_BAT%"
) else (
    echo [ERROR] Launcher script not found in "%SCRIPT_DIR%"!
    echo.
    pause
    exit /b 1
)

:: Create Desktop Shortcut via PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
    "$shortcutPath = Join-Path $desktop 'Isra POS.lnk'; " ^
    "$s = $ws.CreateShortcut($shortcutPath); " ^
    "$s.TargetPath = '%TARGET_FILE%'; " ^
    "$s.WorkingDirectory = '%SCRIPT_DIR%'; " ^
    "$s.Description = 'Isra POS Cashier Terminal (Kiosk Mode)'; " ^
    "if (Test-Path '%ICON_FILE%') { $s.IconLocation = '%ICON_FILE%'; } " ^
    "$s.WindowStyle = 7; " ^
    "$s.Save()"

if %errorLevel% equ 0 (
    echo [SUCCESS] Desktop shortcut created successfully!
    echo.
    echo A shortcut named "Isra POS" is now on your Desktop.
    echo Double-clicking it will open the POS in full-screen Kiosk mode.
) else (
    echo [ERROR] Failed to create Desktop shortcut.
)

echo.
echo ======================================================
pause
