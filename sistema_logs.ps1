# Sistema de logging para que Auto pueda leer la salida
$ErrorActionPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
$logsDir = Join-Path $repoPath ".auto_logs"

# Crear directorio de logs si no existe
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Set-Location $repoPath

# Función para ejecutar comando y guardar en JSON
function Save-CommandOutput {
    param(
        [string]$Command,
        [string]$Description,
        [string]$Category
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logFile = Join-Path $logsDir "$Category.json"
    
    $result = @{
        timestamp = $timestamp
        description = $Description
        command = $Command
        success = $false
        output = ""
        error = ""
        exitCode = -1
    }
    
    try {
        # Ejecutar comando y capturar salida
        $process = Start-Process -FilePath "powershell" `
            -ArgumentList "-NoProfile", "-Command", $Command `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput "$env:TEMP\auto_stdout.txt" `
            -RedirectStandardError "$env:TEMP\auto_stderr.txt"
        
        $result.exitCode = $process.ExitCode
        $result.success = ($process.ExitCode -eq 0)
        
        if (Test-Path "$env:TEMP\auto_stdout.txt") {
            $result.output = Get-Content "$env:TEMP\auto_stdout.txt" -Raw -ErrorAction SilentlyContinue
            Remove-Item "$env:TEMP\auto_stdout.txt" -ErrorAction SilentlyContinue
        }
        
        if (Test-Path "$env:TEMP\auto_stderr.txt") {
            $result.error = Get-Content "$env:TEMP\auto_stderr.txt" -Raw -ErrorAction SilentlyContinue
            Remove-Item "$env:TEMP\auto_stderr.txt" -ErrorAction SilentlyContinue
        }
        
    } catch {
        $result.error = $_.Exception.Message
    }
    
    # Leer archivo existente o crear nuevo
    $allResults = @()
    if (Test-Path $logFile) {
        try {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $allResults = $content | ConvertFrom-Json
                if (-not $allResults) { $allResults = @() }
            }
        } catch {
            $allResults = @()
        }
    }
    
    # Agregar nuevo resultado (mantener solo últimos 50)
    $allResults += $result
    if ($allResults.Count -gt 50) {
        $allResults = $allResults[-50..-1]
    }
    
    # Guardar
    $allResults | ConvertTo-Json -Depth 10 | Set-Content $logFile -Encoding UTF8
    
    return $result
}

Write-Host "=== Sistema de Logging para Auto ===" -ForegroundColor Cyan
Write-Host "Logs se guardan en: $logsDir" -ForegroundColor Yellow

# GOOGLE CLOUD
Write-Host "`nEjecutando comandos de Google Cloud..." -ForegroundColor Green

Save-CommandOutput `
    -Command "gcloud config get-value project" `
    -Description "Proyecto actual" `
    -Category "gcloud_config"

Save-CommandOutput `
    -Command "gcloud builds list --project=check-in-sf --limit=5 --format=json" `
    -Description "Builds recientes" `
    -Category "gcloud_builds"

Save-CommandOutput `
    -Command "gcloud builds list --project=check-in-sf --ongoing --format=json" `
    -Description "Builds en progreso" `
    -Category "gcloud_builds"

Save-CommandOutput `
    -Command "gcloud builds triggers list --project=check-in-sf --format=json" `
    -Description "Triggers de Cloud Build" `
    -Category "gcloud_triggers"

Save-CommandOutput `
    -Command "gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format=json" `
    -Description "Servicio Cloud Run" `
    -Category "gcloud_run"

Save-CommandOutput `
    -Command "gcloud run revisions list --service=mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --limit=3 --format=json" `
    -Description "Revisiones recientes" `
    -Category "gcloud_run"

# GITHUB
Write-Host "`nEjecutando comandos de GitHub..." -ForegroundColor Green

Save-CommandOutput `
    -Command "git remote -v" `
    -Description "Remoto configurado" `
    -Category "github_config"

Save-CommandOutput `
    -Command "git status" `
    -Description "Estado del repositorio" `
    -Category "github_status"

Save-CommandOutput `
    -Command "git log --oneline -5" `
    -Description "Últimos 5 commits" `
    -Category "github_log"

Save-CommandOutput `
    -Command "git ls-remote origin HEAD" `
    -Description "Conexión con GitHub" `
    -Category "github_remote"

Write-Host "`n✓ Logs guardados en: $logsDir" -ForegroundColor Green
Write-Host "Auto puede leer estos archivos JSON para ver la salida" -ForegroundColor Yellow

