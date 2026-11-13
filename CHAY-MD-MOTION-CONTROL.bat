@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "MD Motion Control.exe" (
    start "" "MD Motion Control.exe"
    exit /b 0
)
if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
    exit /b 0
)
npx electron .
