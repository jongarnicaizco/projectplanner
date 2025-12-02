# Script para verificar Google Cloud y guardar salida
$ErrorActionPreference = "Continue"

$outputFile = "gcloud_output.txt"
$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Set-Location $repoPath

# Limpiar archivo anterior
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }

Write-Host "Ejecutando comandos de Google Cloud..." -ForegroundColor Cyan

# Función para ejecutar comando y guardar salida
function Execute-Command {
    param($cmd, $description)
    
    "`n$('='*80)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    "=== $description ===" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    "Comando: $cmd" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    "$('='*80)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    
    try {
        $result = Invoke-Expression $cmd 2>&1 | Out-String
        $result | Out-File -FilePath $outputFile -Append -Encoding UTF8
        "Exit code: $LASTEXITCODE" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    } catch {
        "Error: $_" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    }
}

# Verificar configuración de gcloud
Execute-Command "gcloud config get-value project" "Proyecto actual de Google Cloud"

# Listar builds recientes
Execute-Command "gcloud builds list --project=check-in-sf --limit=5 --format='table(id,status,createTime,source.repoSource.branchName)'" "Builds recientes de Cloud Build"

# Listar triggers
Execute-Command "gcloud builds triggers list --project=check-in-sf --format='table(name,github.repo,github.branch,status)'" "Triggers de Cloud Build"

# Verificar servicio de Cloud Run
Execute-Command "gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format='value(status.latestReadyRevisionName,status.latestCreatedRevisionName)'" "Última revisión de Cloud Run"

# Listar revisiones recientes
Execute-Command "gcloud run revisions list --service=mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --limit=3 --format='table(name,status,created)'" "Revisiones recientes de Cloud Run"

# Verificar builds en progreso
Execute-Command "gcloud builds list --project=check-in-sf --ongoing --format='table(id,status,createTime)'" "Builds en progreso"

Write-Host "Salida guardada en: $outputFile" -ForegroundColor Green
Start-Sleep -Seconds 2

if (Test-Path $outputFile) {
    Write-Host "`nContenido del archivo:" -ForegroundColor Yellow
    Get-Content $outputFile
} else {
    Write-Host "Error: No se pudo crear el archivo" -ForegroundColor Red
}

