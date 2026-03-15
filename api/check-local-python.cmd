@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Missing repo-local Python environment at api\.venv\Scripts\python.exe
  echo Create the venv with the Python version you want to run for this project.
  echo Python 3.14 is supported by Azure Functions in preview.
  echo Example:
  echo   py -3.14 -m venv .venv
  echo Then install dependencies with: .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

set "PYTHON_VERSION="
for /f "tokens=2" %%I in ('".venv\Scripts\python.exe" -V 2^>^&1') do set "PYTHON_VERSION=%%I"

if not defined PYTHON_VERSION (
  echo Failed to determine the Python version for api\.venv.
  exit /b 1
)

for /f "tokens=1,2 delims=." %%A in ("%PYTHON_VERSION%") do set "PYTHON_MAJOR_MINOR=%%A.%%B"

if "%PYTHON_MAJOR_MINOR%"=="3.14" (
  echo Using Python %PYTHON_VERSION% in api\.venv. Azure Functions support for 3.14 is currently preview.
  echo On Windows, prefer api\start-local.cmd over a bare func host start when using 3.14.
  exit /b 0
)
if "%PYTHON_MAJOR_MINOR%"=="3.13" exit /b 0
if "%PYTHON_MAJOR_MINOR%"=="3.12" exit /b 0
if "%PYTHON_MAJOR_MINOR%"=="3.10" exit /b 0
if "%PYTHON_MAJOR_MINOR%"=="3.11" exit /b 0

echo Unsupported repo-local Python version in api\.venv: %PYTHON_VERSION%
echo Azure Functions v4 supports this project on Python 3.10 through 3.14.
echo Delete and recreate api\.venv with a supported interpreter:
echo   rmdir /s /q .venv
echo   py -3.14 -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
exit /b 1
