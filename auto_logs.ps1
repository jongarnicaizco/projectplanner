# Script automático para generar logs que Auto puede leer
# Este script captura toda la información de Google Cloud y GitHub

$ErrorActionPreference = "Continue"
$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
$logsDir = Join-Path $repoPath "auto_logs"

# Crear directorio si no existe
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Set-Location $repoPath

function Get-CommandOutput {
    param([string]$Command, [string]$Description)
    
    Write-Host "  → $Description..." -ForegroundColor Gray
    
    try {
        # Usar Start-Process para capturar mejor la salida
        $tempOut = Join-Path $env:TEMP "auto_cmd_out_$(Get-Random).txt"
        $tempErr = Join-Path $env:TEMP "auto_cmd_err_$(Get-Random).txt"
        
        $process = Start-Process -FilePath "powershell" `
            -ArgumentList "-NoProfile", "-Command", $Command `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $tempOut `
            -RedirectStandardError $tempErr
        
        $output = ""
        $error = ""
        
        if (Test-Path $tempOut) {
            $output = Get-Content $tempOut -Raw -ErrorAction SilentlyContinue
            Remove-Item $tempOut -ErrorAction SilentlyContinue
        }
        
        if (Test-Path $tempErr) {
            $error = Get-Content $tempErr -Raw -ErrorAction SilentlyContinue
            Remove-Item $tempErr -ErrorAction SilentlyContinue
        }
        
        return @{
            success = ($process.ExitCode -eq 0)
            output = $output.Trim()
            error = $error.Trim()
            exitCode = $process.ExitCode
        }
    } catch {
        return @{
            success = $false
            output = ""
            error = $_.Exception.Message
            exitCode = -1
        }
    }
}

Write-Host "`n=== Generando logs automáticos ===" -ForegroundColor Cyan
Write-Host "Directorio de logs: $logsDir" -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$results = @{
    timestamp = $timestamp
    gcloud = @{}
    github = @{}
}

# ============================================
# GOOGLE CLOUD
# ============================================
Write-Host "`n[Google Cloud]" -ForegroundColor Green

$results.gcloud.project = Get-CommandOutput "gcloud config get-value project" "Proyecto actual"
$results.gcloud.builds = Get-CommandOutput "gcloud builds list --project=check-in-sf --limit=5 --format=json" "Builds recientes"
$results.gcloud.ongoing = Get-CommandOutput "gcloud builds list --project=check-in-sf --ongoing --format=json" "Builds en progreso"
$results.gcloud.triggers = Get-CommandOutput "gcloud builds triggers list --project=check-in-sf --format=json" "Triggers de Cloud Build"
$results.gcloud.service = Get-CommandOutput "gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format=json" "Servicio Cloud Run"
$results.gcloud.revisions = Get-CommandOutput "gcloud run revisions list --service=mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --limit=3 --format=json" "Revisiones recientes"

# ============================================
# GITHUB
# ============================================
Write-Host "`n[GitHub]" -ForegroundColor Green

$results.github.remote = Get-CommandOutput "git remote -v" "Remoto configurado"
$results.github.status = Get-CommandOutput "git status" "Estado del repositorio"
$results.github.log = Get-CommandOutput "git log --oneline -5" "Últimos 5 commits"
$results.github.connection = Get-CommandOutput "git ls-remote origin HEAD" "Conexión con GitHub"

# Guardar en archivo JSON
$outputFile = Join-Path $logsDir "status.json"
$results | ConvertTo-Json -Depth 10 | Set-Content $outputFile -Encoding UTF8

Write-Host "`n✓ Logs guardados en: $outputFile" -ForegroundColor Green
Write-Host "  Auto puede leer este archivo automáticamente" -ForegroundColor Yellow

# También guardar un resumen legible
$summaryFile = Join-Path $logsDir "summary.txt"
$summary = @"
=== RESUMEN DE ESTADO ===
Generado: $timestamp

GOOGLE CLOUD:
- Proyecto: $(if ($results.gcloud.project.success) { $results.gcloud.project.output } else { "Error" })
- Builds recientes: $(if ($results.gcloud.builds.success) { "OK" } else { "Error" })
- Builds en progreso: $(if ($results.gcloud.ongoing.success) { "OK" } else { "Error" })
- Triggers: $(if ($results.gcloud.triggers.success) { "OK" } else { "Error" })
- Servicio Cloud Run: $(if ($results.gcloud.service.success) { "OK" } else { "Error" })

GITHUB:
- Remoto: $(if ($results.github.remote.success) { "OK" } else { "Error" })
- Estado: $(if ($results.github.status.success) { "OK" } else { "Error" })
- Commits: $(if ($results.github.log.success) { "OK" } else { "Error" })
- Conexión: $(if ($results.github.connection.success) { "OK" } else { "Error" })
"@

$summary | Set-Content $summaryFile -Encoding UTF8

Write-Host "✓ Resumen guardado en: $summaryFile" -ForegroundColor Green
