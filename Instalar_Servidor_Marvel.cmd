@echo off
title Instalar Servidor Marvel - Autostart
pushd %~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File %~dp0criar_atalhos.ps1
popd
echo.
echo Servidor Marvel instalado na inicializacao com sucesso!
pause

