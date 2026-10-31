@echo off
REM Double-click this file to start Tinta.
cd /d "%~dp0"

REM CR-36 — check `py` (the Python launcher) BEFORE `python`. The Store-stub
REM python.exe that ships with Windows resolves `where python` successfully
REM but opens the Microsoft Store instead of running anything, so the old
REM order made double-clicking this file open the Store on machines without
REM real Python. The py launcher only exists where a real Python was
REM installed with it, so it is the reliable first probe.
where py >nul 2>nul
if %errorlevel%==0 (
  py serve.py
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py
  goto :eof
)

echo Python was not found on this computer.
echo Install it from https://www.python.org/downloads/ and try again.
echo (During install, check "Add python.exe to PATH".)
pause
