@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Missing repo-local Python environment at api\.venv\Scripts\python.exe
  echo Create it with: py -3.9 -m venv .venv
  echo Then install dependencies with: .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 exit /b %errorlevel%

echo Starting Azure Functions host with api\.venv...
func host start --verbose
