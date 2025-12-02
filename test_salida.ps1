# Script para probar captura de salida
$ErrorActionPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

$outputFile = "test_output.txt"

Write-Host "Ejecutando comandos y guardando salida en $outputFile..." -ForegroundColor Cyan

# Limpiar archivo anterior
if (Test-Path $outputFile) { Remove-Item $outputFile }

# Ejecutar comandos y guardar salida
"=== git remote -v ===" | Out-File -FilePath $outputFile -Encoding UTF8
git remote -v 2>&1 | Out-File -FilePath $outputFile -Append -Encoding UTF8

"`n=== git status ===" | Out-File -FilePath $outputFile -Append -Encoding UTF8
git status 2>&1 | Out-File -FilePath $outputFile -Append -Encoding UTF8

"`n=== git log --oneline -3 ===" | Out-File -FilePath $outputFile -Append -Encoding UTF8
git log --oneline -3 2>&1 | Out-File -FilePath $outputFile -Append -Encoding UTF8

"`n=== git ls-remote origin HEAD ===" | Out-File -FilePath $outputFile -Append -Encoding UTF8
git ls-remote origin HEAD 2>&1 | Out-File -FilePath $outputFile -Append -Encoding UTF8

Write-Host "Salida guardada en $outputFile" -ForegroundColor Green
Write-Host "`nContenido del archivo:" -ForegroundColor Yellow
Get-Content $outputFile

