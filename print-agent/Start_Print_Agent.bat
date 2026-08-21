@echo off
title Isra POS Print Agent
echo Starting Isra POS Print Agent on http://127.0.0.1:18181...
cd /d "%~dp0"
node agent.js
pause
