@echo off
cd /d "%~dp0"
python tools\start-game.py %*
if errorlevel 1 pause
