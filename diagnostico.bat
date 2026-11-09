@echo off
setlocal
cd /d "%~dp0."
echo Coletando diagnostico. Aguarde alguns segundos...
powershell -NoProfile -Command "$cr=[char]13; $lf=[char]10; foreach($f in @('iniciar.bat','diagnostico.bat')){ if(Test-Path $f){ $t=[IO.File]::ReadAllText($f); $n=$t.Replace($cr+$lf,$lf).Replace($lf,$cr+$lf); if($n -ne $t){ [IO.File]::WriteAllText($f,$n); Write-Output ('Convertido para CRLF: '+$f) } } }"
echo.
echo === Node.js ===
node --version
echo.
echo === Arquivos do patch ===
if exist "server.js" (echo OK  server.js) else (echo FALTA  server.js)
if exist "src\config.js" (echo OK  src\config.js) else (echo FALTA  src\config.js)
if exist "src\boot-database.js" (echo OK  src\boot-database.js) else (echo FALTA  src\boot-database.js)
if exist "wwwroot\js\boot.js" (echo OK  wwwroot\js\boot.js) else (echo FALTA  wwwroot\js\boot.js)
if exist ".env" (echo OK  .env) else (echo FALTA  .env)
echo.
echo === Sintaxe dos arquivos novos ===
node --check server.js && echo OK  server.js
node --check src\config.js && echo OK  src\config.js
node --check src\boot-database.js && echo OK  src\boot-database.js
node --check wwwroot\js\boot.js && echo OK  wwwroot\js\boot.js
echo.
echo === Porta/HOST no .env ===
if exist ".env" findstr /i "PORT HOST DB_NAME DB_SERVER DB_INSTANCE DB_AUTH" .env
echo.
echo === Porta 5090 em uso? ===
netstat -ano | findstr ":5090"
echo.
echo === Teste rapido: sobe o servidor por 6 segundos ===
powershell -NoProfile -Command "$env:OPEN_BROWSER='false'; $p = Start-Process -FilePath 'node' -ArgumentList 'server.js' -PassThru -NoNewWindow -RedirectStandardOutput 'boot-teste.log' -RedirectStandardError 'boot-teste-erro.log'; Start-Sleep -Seconds 6; if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }; Write-Output '--- saida ---'; Get-Content 'boot-teste.log' -ErrorAction SilentlyContinue; Write-Output '--- erros ---'; Get-Content 'boot-teste-erro.log' -ErrorAction SilentlyContinue"
echo.
echo === Fim ===
pause
