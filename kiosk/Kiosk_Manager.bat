@echo off
setlocal enabledelayedexpansion
title Isra POS - Kiosk Setup & Launcher

:MENU
cls
echo ======================================================
echo             ISRA POS - KIOSK MANAGER
echo ======================================================
echo.
echo   [1] Launch POS Kiosk Now
echo   [2] Create Desktop Shortcut ("Isra POS")
echo   [3] Enable Auto-Start on Windows Boot
echo   [4] Disable Auto-Start on Windows Boot
echo   [5] Configure Server IP / URL
echo   [0] Exit
echo.
echo ======================================================
set /p CHOICE="Enter your choice (0-5): "

if "%CHOICE%"=="1" goto LAUNCH
if "%CHOICE%"=="2" goto SHORTCUT
if "%CHOICE%"=="3" goto AUTOSTART_ON
if "%CHOICE%"=="4" goto AUTOSTART_OFF
if "%CHOICE%"=="5" goto CONFIG_IP
if "%CHOICE%"=="0" exit /b 0

echo Invalid choice, please try again.
timeout /t 2 >nul
goto MENU

:LAUNCH
cls
echo Starting Isra POS Kiosk...
start "" "%~dp0Launch_POS_Kiosk.bat"
goto MENU

:SHORTCUT
cls
call "%~dp0create-desktop-shortcut.bat"
goto MENU

:AUTOSTART_ON
cls
call "%~dp0enable-kiosk-autostart.bat"
goto MENU

:AUTOSTART_OFF
cls
call "%~dp0disable-kiosk-autostart.bat"
goto MENU

:CONFIG_IP
cls
echo ======================================================
echo               Configure Server URL
echo ======================================================
echo.
echo Current Launch_POS_Kiosk.bat URL:
findstr /C:"--app=" "%~dp0Launch_POS_Kiosk.bat"
echo.
echo Enter new Server URL (e.g. http://192.168.1.100:3001)
echo or press ENTER to cancel:
set "NEW_URL="
set /p NEW_URL="New URL: "
if not "!NEW_URL!"=="" (
    powershell -NoProfile -Command "(Get-Content '%~dp0Launch_POS_Kiosk.bat') -replace '--app=http[^\s]*', '--app=!NEW_URL!' -replace 'unsafely-treat-insecure-origin-as-secure=\`\"http[^\`\"]*\`\"', 'unsafely-treat-insecure-origin-as-secure=\"!NEW_URL!\"' | Set-Content '%~dp0Launch_POS_Kiosk.bat'"
    echo.
    echo [SUCCESS] Server URL updated to: !NEW_URL!
    echo.
    pause
)
goto MENU
