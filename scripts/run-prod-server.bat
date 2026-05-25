@echo off
cd /d "%~dp0.."
set "PORT=4000"
if not exist "backend\data" mkdir "backend\data"
node backend\dist\server.js
echo.
echo Server stopped. If this closed unexpectedly, copy the error above.
pause
