@echo off
title Uninstall Isra POS Print Agent from Startup

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\IsraPOS_PrintAgent.lnk"

if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo [SUCCESS] Removed Isra POS Print Agent from Windows Startup.
) else (
    echo [INFO] Shortcut was not found in Startup folder.
)

:: Kill running agent process on port 18181
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":18181" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [SUCCESS] Print Agent stopped.
echo.
pause
