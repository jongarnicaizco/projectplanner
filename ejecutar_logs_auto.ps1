# Script para ejecutar auto_logs.ps1 desde Auto
# Este script se ejecuta automáticamente cuando Auto necesita ver el estado

$ErrorActionPreference = "Continue"
$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
$scriptPath = Join-Path $repoPath "auto_logs.ps1"

Set-Location $repoPath

Write-Host "Ejecutando sistema de logs automático..." -ForegroundColor Cyan

if (Test-Path $scriptPath) {
    & powershell -ExecutionPolicy Bypass -File $scriptPath
    Write-Host "`nEsperando a que se generen los archivos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
} else {
    Write-Host "Error: No se encontró auto_logs.ps1" -ForegroundColor Red
    exit 1
}

