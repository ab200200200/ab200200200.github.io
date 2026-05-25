@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] This app needs Node.js.
  echo Please install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please reinstall Node.js LTS.
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo First launch: installing dependencies. This can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist "%ROOT%backend\dist\server.js" (
  echo First launch: building the app...
  call npm run build
  if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

if not exist "%ROOT%frontend\dist\index.html" (
  echo Building frontend files...
  call npm run build
  if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

echo Starting Taiwan Stock Analysis Platform...
start "Taiwan Stock Platform Server" "%ComSpec%" /k ""%ROOT%scripts\run-prod-server.bat""

echo Waiting for the local server...
node -e "const http=require('http');const deadline=Date.now()+30000;function check(){const req=http.get('http://localhost:4000/health',res=>{res.resume();if(res.statusCode===200)process.exit(0);retry();});req.setTimeout(2000,()=>{req.destroy();retry();});req.on('error',retry);}function retry(){if(Date.now()>deadline)process.exit(1);setTimeout(check,1000);}check();"
if errorlevel 1 (
  echo.
  echo [ERROR] Server did not start on http://localhost:4000
  echo Please check the "Taiwan Stock Platform Server" window for the real error.
  pause
  exit /b 1
)

start "" "http://localhost:4000/"

echo.
echo The app should open at http://localhost:4000/
echo Keep the server window open while using the app.
pause
