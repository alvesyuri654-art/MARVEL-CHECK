@echo off
title Sistema Anomalias Marvel - Torre de Controle
cls
pushd "%~dp0"

echo ========================================================
echo   SISTEMA ANOMALIAS MARVEL - TORRE DE CONTROLE
echo ========================================================
echo.
echo Conectando ao servidor Marvel...
start "" wscript.exe "%~dp0abrir_sistema.vbs"

popd
exit