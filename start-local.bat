@echo off
chcp 65001 >nul
title Gaza Locations - local
REM Starts PostgreSQL, the Django API and the React site for local use.

set PG_BIN=E:\pgsql\pgsql\bin
set PG_DATA=E:\pgsql\data
set ROOT=%~dp0

echo [1/3] PostgreSQL...
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" status >nul 2>&1
if errorlevel 1 (
    start "PostgreSQL" /min "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "E:\pgsql\postgres.log" -o "-p 5432 -c listen_addresses=localhost" start
    timeout /t 4 /nobreak >nul
) else (
    echo     already running
)

echo [2/3] Backend  (http://127.0.0.1:8000)...
start "Backend - Django" cmd /k "cd /d "%ROOT%backend" && .venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"

echo [3/3] Frontend (http://localhost:5173)...
start "Frontend - React" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

timeout /t 6 /nobreak >nul
start "" http://localhost:5173
echo.
echo Site: http://localhost:5173
echo To stop: close the Backend and Frontend windows, then run stop-local.bat
