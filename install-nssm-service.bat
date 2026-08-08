@echo off
echo ========================================
echo Installing Isra POS Server as Windows Service
echo ========================================

:: Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click the file and select "Run as administrator"
    pause
    exit /b 1
)

:: Check if NSSM exists
if not exist "C:\nssm\nssm.exe" (
    echo ERROR: NSSM not found at C:\nssm\nssm.exe
    echo Please run download-nssm.bat first
    pause
    exit /b 1
)

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Check if server-dist exists in current directory
if not exist "%SCRIPT_DIR%\server-dist\index.js" (
    echo ERROR: Server build not found at %SCRIPT_DIR%\server-dist\index.js
    echo Please run: pnpm build
    pause
    exit /b 1
)

:: Create log directory
if not exist "C:\POS-Logs" mkdir "C:\POS-Logs"

:: Set variables
set SERVICE_NAME=IsraPOSServer
set APP_PATH=C:\Program Files\nodejs\node.exe
set APP_DIR=%SCRIPT_DIR%
set APP_ARGS=server-dist\index.js

:: Install service
echo Installing service: %SERVICE_NAME%
C:\nssm\nssm.exe install %SERVICE_NAME% "%APP_PATH%" "%APP_ARGS%"

if %errorLevel% neq 0 (
    echo ERROR: Failed to install service
    pause
    exit /b 1
)

:: Configure service settings
echo Configuring service settings...
C:\nssm\nssm.exe set %SERVICE_NAME% AppDirectory "%APP_DIR%"
C:\nssm\nssm.exe set %SERVICE_NAME% AppEnvironmentExtra "NODE_ENV=production"
C:\nssm\nssm.exe set %SERVICE_NAME% DisplayName "Isra POS Server"
C:\nssm\nssm.exe set %SERVICE_NAME% Description "Hardware POS System Backend Server"
C:\nssm\nssm.exe set %SERVICE_NAME% Start SERVICE_AUTO_START
C:\nssm\nssm.exe set %SERVICE_NAME% AppStdout "C:\POS-Logs\server.log"
C:\nssm\nssm.exe set %SERVICE_NAME% AppStderr "C:\POS-Logs\server-error.log"

:: Start the service
echo Starting service...
C:\nssm\nssm.exe start %SERVICE_NAME%

if %errorLevel% neq 0 (
    echo WARNING: Service may not have started successfully
    echo Check logs at C:\POS-Logs\server-error.log
) else (
    echo Service started successfully
)

:: Show service status
echo.
echo Service Status:
C:\nssm\nssm.exe status %SERVICE_NAME%

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Service Name: %SERVICE_NAME%
echo Logs Location: C:\POS-Logs\
echo.
echo To manage the service:
echo   Start:   nssm start %SERVICE_NAME%
echo   Stop:    nssm stop %SERVICE_NAME%
echo   Restart: nssm restart %SERVICE_NAME%
echo   Status:  nssm status %SERVICE_NAME%
echo   Remove:  nssm remove %SERVICE_NAME% confirm
echo.
echo Test the server at: http://localhost:3001
echo.
pause
