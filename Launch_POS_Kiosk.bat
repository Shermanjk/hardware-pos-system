@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --no-first-run --no-default-browser-check --disable-features=AutofillServerCommunication,PasswordManager --password-store=basic --app=http://isra-pos-server:3001
exit
