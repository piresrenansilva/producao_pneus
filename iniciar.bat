
@echo off
title Fabrica de Pneus - Sistema
cd /d "D:\pessoal\projetos\sistema_em_producao"

echo ========================================
echo       FABRICA DE PNEUS
echo ========================================
echo.

:executar
echo Iniciando servidor Node.js...

node server.js

echo.
echo O servidor foi encerrado.
echo Reiniciando em 3 segundos...
timeout /t 3 /nobreak >nul
goto executar
