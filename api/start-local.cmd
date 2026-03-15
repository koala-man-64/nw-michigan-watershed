@echo off
setlocal

cd /d "%~dp0"

call "%~dp0check-local-python.cmd"
if errorlevel 1 exit /b %errorlevel%

call ".venv\Scripts\activate.bat"
if errorlevel 1 exit /b %errorlevel%

set "PYTHON_ISOLATE_WORKER_DEPENDENCIES=1"

echo Starting Azure Functions host with api\.venv on port 9091...
func host start --port 9091 --verbose
