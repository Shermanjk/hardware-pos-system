@echo off
setlocal enabledelayedexpansion
title Install Isra POS Print Agent to Windows Startup

echo ========================================================
echo   Installing Isra POS Print Agent to Windows Startup...
echo ========================================================
echo.

set "TARGET_EXE=%~dp0IsraPrintAgent.exe"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\IsraPOS_PrintAgent.lnk"

:: Create direct Windows startup shortcut to the EXE
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_EXE%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Isra POS Hardware Print Agent'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [SUCCESS] Isra POS Print Agent installed to Windows Startup!
    echo Location: %SHORTCUT_PATH%
    echo.
    echo Starting the print agent now in background...
    start "" /b "%TARGET_EXE%"
    echo.
    echo ========================================================
    echo   Setup Complete! The Print Agent will now start
    echo   automatically whenever this computer powers on.
    echo ========================================================
) else (
    echo [ERROR] Failed to create startup shortcut.
)

echo.
pause
