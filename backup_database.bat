@echo off
:: ============================================================
:: backup_database.bat
:: Scheduled MySQL backup for hardware_pos
::
:: SETUP INSTRUCTIONS:
:: 1. Copy this file to a safe location (e.g. C:\POS-Backups\scripts\)
:: 2. Edit the CONFIG section below — do NOT commit credentials to source control
:: 3. Schedule via Windows Task Scheduler:
::    - Action: Start a program
::    - Program: C:\POS-Backups\scripts\backup_database.bat
::    - Trigger: Daily at a low-traffic time (e.g. 2:00 AM)
:: 4. Set BACKUP_DIR to a location on a DIFFERENT physical drive or network share
::    from the primary database files.
::
:: RESTORE INSTRUCTIONS:
::   mysql -u <DB_USER> -p<DB_PASSWORD> -h <DB_HOST> hardware_pos < backup_file.sql
:: ============================================================

:: ── CONFIG (edit these values) ────────────────────────────────────────────────
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
:: DB_PASSWORD: set this as a Windows environment variable named POS_DB_PASSWORD
:: rather than hard-coding it here. Example: setx POS_DB_PASSWORD "yourpassword"
set DB_PASSWORD=%POS_DB_PASSWORD%
set DB_NAME=hardware_pos

:: Backup destination — use a DIFFERENT drive or network share
set BACKUP_DIR=D:\POS-Backups\database

:: Retention: delete backups older than this many days
set RETENTION_DAYS=30

:: Path to mysqldump (adjust if MySQL is installed elsewhere)
set MYSQLDUMP="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
:: ── END CONFIG ────────────────────────────────────────────────────────────────

:: Create backup directory if it doesn't exist
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Generate timestamped filename
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set DATESTAMP=%%c%%a%%b
for /f "tokens=1-3 delims=:." %%a in ("%time: =0%") do set TIMESTAMP=%%a%%b%%c
set FILENAME=%BACKUP_DIR%\hardware_pos_%DATESTAMP%_%TIMESTAMP%.sql

:: Run mysqldump
%MYSQLDUMP% --host=%DB_HOST% --port=%DB_PORT% --user=%DB_USER% --password=%DB_PASSWORD% ^
  --single-transaction --routines --triggers --events ^
  --result-file="%FILENAME%" %DB_NAME%

if %ERRORLEVEL% EQU 0 (
  echo [%date% %time%] Backup successful: %FILENAME% >> "%BACKUP_DIR%\backup.log"
) else (
  echo [%date% %time%] BACKUP FAILED — check mysqldump output >> "%BACKUP_DIR%\backup.log"
  exit /b 1
)

:: Delete backups older than RETENTION_DAYS
forfiles /p "%BACKUP_DIR%" /s /m *.sql /d -%RETENTION_DAYS% /c "cmd /c del @path" 2>nul

echo Backup complete: %FILENAME%
