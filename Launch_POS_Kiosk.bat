@echo off
title Isra POS Kiosk

:: 1. Silently start Print Agent if installed locally (0 windows opened)
if exist "%~dp0print-agent\Start_Print_Agent.vbs" (
    wscript.exe "%~dp0print-agent\Start_Print_Agent.vbs"
) else if exist "C:\IsraPOS-PrintAgent\Start_Print_Agent.vbs" (
    wscript.exe "C:\IsraPOS-PrintAgent\Start_Print_Agent.vbs"
)

:: 2. Launch Chrome POS in Kiosk Mode
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --unsafely-treat-insecure-origin-as-secure="http://isra-pos-server:3001" --disable-features=AutofillServerCommunication,PasswordManager,BlockInsecurePrivateNetworkRequests --no-first-run --no-default-browser-check --password-store=basic --app=http://isra-pos-server:3001
exit
