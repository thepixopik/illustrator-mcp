@echo off
title Pixopik Illustrator Plugin Installer
echo ========================================================
echo   Installing Pixopik MCP Bridge for Adobe Illustrator...
echo ========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0cep-plugin\install-windows.ps1"
echo.
echo Press any key to close this window...
pause >nul
