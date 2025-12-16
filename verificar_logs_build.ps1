# Script para verificar logs de Cloud Build
Write-Host "`n=== Verificando logs de Cloud Build ===" -ForegroundColor Cyan

$project = "check-in-sf"

# Obtener builds recientes
Write-Host "`nObteniendo builds recientes..." -ForegroundColor Yellow
$buildsJson = gcloud builds list --project=$project --limit=10 --format="json" --sort-by=~createTime 2>&1

if ($buildsJson) {
    $builds = $buildsJson | ConvertFrom-Json
    
    Write-Host "`nBuilds encontrados: $($builds.Count)" -ForegroundColor Green
    
    foreach ($build in $builds) {
        $status = $build.status
        $color = switch ($status) {
            "SUCCESS" { "Green" }
            "WORKING" { "Yellow" }
            "FAILURE" { "Red" }
            "CANCELLED" { "Yellow" }
            default { "White" }
        }
        
        Write-Host "`n--- Build: $($build.id) ---" -ForegroundColor Cyan
        Write-Host "Status: $status" -ForegroundColor $color
        Write-Host "Created: $($build.createTime)" -ForegroundColor Gray
        
        if ($build.source.repoSource) {
            Write-Host "Repo: $($build.source.repoSource.repoName)" -ForegroundColor Gray
            Write-Host "Branch: $($build.source.repoSource.branchName)" -ForegroundColor Gray
            Write-Host "Commit: $($build.source.repoSource.commitSha)" -ForegroundColor Gray
        }
        
        if ($build.logUrl) {
            Write-Host "Log URL: $($build.logUrl)" -ForegroundColor Blue
        }
        
        # Si el build falló, obtener los logs
        if ($status -eq "FAILURE" -or $status -eq "CANCELLED") {
            Write-Host "`nObteniendo logs del build fallido..." -ForegroundColor Yellow
            $logs = gcloud builds log $($build.id) --project=$project 2>&1
            if ($logs) {
                Write-Host "`nÚltimas 100 líneas de logs:" -ForegroundColor Yellow
                $logs | Select-Object -Last 100
            }
        }
    }
} else {
    Write-Host "No se pudieron obtener los builds" -ForegroundColor Red
}

# Verificar errores específicos de GitHub
Write-Host "`n`n=== Buscando errores relacionados con GitHub ===" -ForegroundColor Cyan
$errorLogs = gcloud logging read "resource.type=cloud_build_build AND severity>=ERROR AND (textPayload=~'github' OR textPayload=~'repository' OR textPayload=~'repo')" --project=$project --limit=20 --format="table(timestamp,severity,textPayload)" --freshness=24h 2>&1

if ($errorLogs) {
    Write-Host "Errores encontrados:" -ForegroundColor Red
    $errorLogs
} else {
    Write-Host "No se encontraron errores específicos de GitHub en los últimos logs" -ForegroundColor Yellow
}

Write-Host "`n=== Fin de verificación ===" -ForegroundColor Cyan

