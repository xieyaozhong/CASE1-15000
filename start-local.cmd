@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22.5 or newer is required.
  echo Download Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
node local-server.mjs --open
if errorlevel 1 pause

