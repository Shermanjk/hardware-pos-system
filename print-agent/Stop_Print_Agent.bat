@echo off
title Stop Isra POS Print Agent

echo Stopping Isra POS Print Agent...
taskkill /f /im "IsraPrintAgent.exe" >nul 2>&1
for %%p in (18181 18182 18183 18184) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p" ^| findstr "LISTENING"') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)
echo.
echo Print Agent stopped.
pause
