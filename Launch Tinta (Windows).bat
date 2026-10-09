@echo off
REM Double-click this file to start Tinta.
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  py serve.py
  goto :eof
)

echo Python was not found on this computer.
echo Install it from https://www.python.org/downloads/ and try again.
echo (During install, check "Add python.exe to PATH".)
pause
