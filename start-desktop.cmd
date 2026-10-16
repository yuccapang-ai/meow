@echo off
setlocal
cd /d "%~dp0desktop"
set ELECTRON_RUN_AS_NODE=
if not exist node_modules\electron\dist\electron.exe (
  echo Please run npm install in the desktop folder first.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
