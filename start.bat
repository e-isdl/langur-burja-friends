@echo off
REM One-click launcher - double-click this file.
REM Starts the game server + Cloudflare tunnel + opens your browser.
cd /d "%~dp0"
echo.
echo  ============================================
echo   Langur Burja ^& Friends v2 - one-click start
echo  ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 18+ from https://nodejs.org then double-click again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install
)
echo Starting everything...
call npm run live
pause
