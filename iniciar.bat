@echo off
setlocal
title Fabrica de Pneus - Sistema
cd /d "%~dp0."
echo ========================================
echo       FABRICA DE PNEUS
echo ========================================
echo Pasta: %CD%
echo.

if not exist "server.js" goto faltam
if not exist "src\config.js" goto faltam
if not exist "src\boot-database.js" goto faltam
if not exist "wwwroot\js\boot.js" goto faltam
where node >nul 2>&1
if errorlevel 1 goto semnode

if exist ".env" goto temenv
if not exist ".env.example" goto semexample
copy /y ".env.example" ".env" >nul
echo.
echo Foi criado o arquivo .env a partir de .env.example.
echo Confira os dados do SQL Server e rode este arquivo de novo.
echo.
pause
exit /b 0

:temenv
if exist "node_modules\express" goto loop
echo Instalando dependencias do Node.js (primeira vez)...
call npm install --no-audit --no-fund
if errorlevel 1 goto falhanpm

:loop
echo.
echo Iniciando em http://localhost:5090 ...
echo Mantenha esta janela aberta. Ctrl+C encerra.
echo.
node server.js
set CODIGO=%ERRORLEVEL%
echo.
echo *** O servidor encerrou com codigo %CODIGO%. Leia a mensagem acima. ***
echo *** Reiniciando em 5 segundos... ***
timeout /t 5 /nobreak >nul
goto loop

:faltam
echo.
echo ERRO: faltam arquivos do patch nesta pasta.
echo Aplique correcoes-v3.1.patch na raiz do projeto e tente de novo.
echo.
pause
exit /b 1

:semnode
echo.
echo ERRO: o comando "node" nao foi encontrado no PATH.
echo Instale o Node.js 22 ou superior e reabra este arquivo.
echo.
pause
exit /b 1

:semexample
echo.
echo ERRO: nao achei .env.example nesta pasta.
echo Copie o .env.example do pacote de correcoes para ca.
echo.
pause
exit /b 1

:falhanpm
echo.
echo ERRO: falha no npm install. Leia a mensagem acima.
echo.
pause
exit /b 1
