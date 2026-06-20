@echo off
REM ===== Global Warfare - desktop launcher =====
REM Double-click this file to play on your PC (no browser needed).
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
".\node_modules\electron\dist\electron.exe" .
