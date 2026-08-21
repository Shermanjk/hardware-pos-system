@echo off
title Isra POS Hardware Print Agent
cd /d "%~dp0"
echo Starting Isra POS Native Hardware Print Agent on http://127.0.0.1:18181...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent.ps1"
pause
