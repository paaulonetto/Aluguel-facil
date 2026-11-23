@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "$url='http://127.0.0.1:4173/'; function Ready { try { return (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1).Content.Contains('AlugaF') } catch { return $false } }; if (-not (Ready)) { Start-Process -FilePath 'node.exe' -ArgumentList 'serve.js' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -ErrorAction Stop; for ($i=0; $i -lt 20 -and -not (Ready); $i++) { Start-Sleep -Milliseconds 250 } }; if (Ready) { Start-Process $url } else { Write-Error 'Falha ao iniciar o painel. Abra AlugaFacil.html nesta pasta.'; exit 1 }"
if errorlevel 1 pause
