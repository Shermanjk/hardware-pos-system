@echo off
setlocal enabledelayedexpansion
title Install Isra POS Print Agent to Windows Startup

echo ========================================================
echo   Installing Isra POS Print Agent to Windows Startup...
echo ========================================================
echo.

set "TARGET_SCRIPT=%~dp0Start_Print_Agent.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\IsraPOS_PrintAgent.lnk"

:: Create Windows shortcut using PowerShell
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_SCRIPT%\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Isra POS Hardware Print Agent'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [SUCCESS] Isra POS Print Agent installed to Windows Startup!
    echo Location: %SHORTCUT_PATH%
    echo.
    echo Starting the print agent now in background...
    wscript.exe "%TARGET_SCRIPT%"
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
