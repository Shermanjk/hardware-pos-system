@echo off
echo ========================================
echo Downloading and Installing NSSM...
echo ========================================

:: Create NSSM directory
if not exist "C:\nssm" mkdir "C:\nssm"

:: Download latest NSSM release
echo Downloading NSSM from official repository...
powershell -Command "& {Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile 'C:\nssm\nssm.zip'}"

if not exist "C:\nssm\nssm.zip" (
    echo ERROR: Failed to download NSSM
    pause
    exit /b 1
)

:: Extract the zip file
echo Extracting NSSM...
powershell -Command "& {Expand-Archive -Path 'C:\nssm\nssm.zip' -DestinationPath 'C:\nssm' -Force}"

:: Clean up zip file
del "C:\nssm\nssm.zip"

:: Find the extracted folder and move contents
for /d %%i in ("C:\nssm\nssm-*") do (
    echo Moving NSSM files...
    xcopy "%%i\win64\*" "C:\nssm\" /Y /E
    rd /s /q "%%i"
)

echo ========================================
echo NSSM downloaded and extracted to C:\nssm\
echo ========================================
echo.
echo Next steps:
echo 1. Run: pnpm build
echo 2. Run: install-nssm-service.bat
echo.
pause
