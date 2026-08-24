@echo off
rem Starts the DMC app server for local testing. Double-click me after a reboot.
start "DMC app server" /min python "%~dp0scripts\serve.py"
echo DMC app is running at http://localhost:8765/
timeout /t 4 >nul
