@echo off
cd /d "%~dp0"
echo Iniciando servidor de sincronizacao com o Melvin...
node melvin-sync-server.js
pause
