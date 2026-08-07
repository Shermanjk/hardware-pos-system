@echo off

:WAIT

curl http://localhost:3001 >nul 2>&1

if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto WAIT
)

start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --new-window --kiosk http://isra-pos-server:3001

exit