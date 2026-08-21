@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\ChromePOSProfile" --unsafely-treat-insecure-origin-as-secure="http://isra-pos-server:3001,http://noob:3001" --disable-features=AutofillServerCommunication,PasswordManager,BlockInsecurePrivateNetworkRequests --no-first-run --no-default-browser-check --password-store=basic --app=http://noob:3001
exit
