# Script simple para obtener logs de Cloud Run
$ErrorActionPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
$outputFile = Join-Path $repoPath "logs_cloudrun.txt"

Set-Location $repoPath

Write-Host "Obteniendo logs de Cloud Run..." -ForegroundColor Cyan

# Limpiar archivo anterior
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }

# Obtener logs recientes (últimas 2 horas)
$cmd = 'gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai" --project=check-in-sf --limit=100 --format="table(timestamp,severity,textPayload)" --freshness=2h'

Write-Host "Ejecutando comando..." -ForegroundColor Yellow
$result = Invoke-Expression $cmd 2>&1 | Out-String

# Guardar en archivo
$result | Out-File -FilePath $outputFile -Encoding UTF8

Write-Host "`n✓ Logs guardados en: $outputFile" -ForegroundColor Green
Write-Host "Total de caracteres: $($result.Length)" -ForegroundColor Gray

# Mostrar primeras líneas
Write-Host "`nPrimeras 20 líneas:" -ForegroundColor Yellow
Get-Content $outputFile -TotalCount 20

