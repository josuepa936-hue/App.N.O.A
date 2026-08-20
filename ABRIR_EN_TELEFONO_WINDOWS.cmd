@echo off
title NOA Mobile Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado.
  echo Para pruebas puedes subir esta carpeta a un hosting HTTPS.
  pause
  exit /b 1
)
node serve_mobile.mjs
pause
