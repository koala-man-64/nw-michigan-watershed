@echo off
setlocal

cd /d "%~dp0"

call "%~dp0check-local-python.cmd"
if errorlevel 1 exit /b %errorlevel%

set "PYTHON_PACKAGES_DIR=%CD%\.python_packages\lib\site-packages"

echo Installing dependencies into api\.venv...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 exit /b %errorlevel%

if exist ".python_packages" rmdir /s /q ".python_packages"
mkdir "%PYTHON_PACKAGES_DIR%"
if errorlevel 1 exit /b %errorlevel%

echo Installing dependencies into api\.python_packages for Azure Functions Core Tools...
".venv\Scripts\python.exe" -m pip install -r requirements.txt --target "%PYTHON_PACKAGES_DIR%"
if errorlevel 1 exit /b %errorlevel%
