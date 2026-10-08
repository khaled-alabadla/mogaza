@echo off
REM Stops the local PostgreSQL server (close the Backend/Frontend windows yourself).
"E:\pgsql\pgsql\bin\pg_ctl.exe" -D "E:\pgsql\data" stop -m fast
pause
