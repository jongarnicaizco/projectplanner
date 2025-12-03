# Script para verificar que el trigger automático funciona
$ErrorActionPreference = "Continue"

$project = "check-in-sf"

Write-Host "`n=== VERIFICACIÓN DE TRIGGER AUTOMÁTICO ===" -ForegroundColor Cyan

Write-Host "`n1. Triggers configurados:" -ForegroundColor Yellow
$triggersJson = gcloud builds triggers list --project=$project --format=json 2>&1
$triggers = $triggersJson | ConvertFrom-Json

if ($triggers -and $triggers.Count -gt 0) {
    Write-Host "  Se encontraron $($triggers.Count) trigger(s):" -ForegroundColor Green
    foreach ($trigger in $triggers) {
        Write-Host "`n  Trigger: $($trigger.name)" -ForegroundColor White
        $disabled = if ($trigger.disabled) { "DESHABILITADO" } else { "HABILITADO" }
        $disabledColor = if ($trigger.disabled) { "Red" } else { "Green" }
        Write-Host "    Estado: $disabled" -ForegroundColor $disabledColor
        
        if ($trigger.github) {
            Write-Host "    Repositorio: $($trigger.github.owner)/$($trigger.github.name)" -ForegroundColor White
            if ($trigger.github.push) {
                Write-Host "    Rama: $($trigger.github.push.branch)" -ForegroundColor White
            }
        }
        
        if ($trigger.filename) {
            Write-Host "    Archivo: $($trigger.filename)" -ForegroundColor White
        }
    }
} else {
    Write-Host "  No se encontraron triggers" -ForegroundColor Red
    Write-Host "    Necesitas configurar un trigger para despliegue automático" -ForegroundColor Yellow
}

Write-Host "`n2. Builds recientes (ultimos 10):" -ForegroundColor Yellow
$buildsJson = gcloud builds list --project=$project --limit=10 --format=json 2>&1
$builds = $buildsJson | ConvertFrom-Json

if ($builds -and $builds.Count -gt 0) {
    Write-Host "  Builds encontrados:" -ForegroundColor Green
    $automaticCount = 0
    $manualCount = 0
    
    foreach ($build in $builds) {
        $source = $build.source
        $isAutomatic = $false
        $sourceInfo = ""
        
        if ($source.repoSource) {
            $isAutomatic = $true
            $automaticCount++
            $sourceInfo = "GitHub: $($source.repoSource.branchName)"
        } elseif ($source.storageSource) {
            $isAutomatic = $false
            $manualCount++
            $sourceInfo = "Manual (storage)"
        } else {
            $manualCount++
            $sourceInfo = "Manual"
        }
        
        $statusColor = if ($build.status -eq "SUCCESS") { "Green" } elseif ($build.status -eq "FAILURE") { "Red" } elseif ($build.status -eq "WORKING") { "Yellow" } else { "White" }
        
        Write-Host "`n    [$($build.id)]" -ForegroundColor Gray
        Write-Host "      Estado: $($build.status)" -ForegroundColor $statusColor
        Write-Host "      Origen: $sourceInfo" -ForegroundColor $(if ($isAutomatic) { "Green" } else { "Yellow" })
        Write-Host "      Creado: $($build.createTime)" -ForegroundColor White
    }
    
    Write-Host "`n  Resumen:" -ForegroundColor Cyan
    Write-Host "    Automaticos (desde GitHub): $automaticCount" -ForegroundColor Green
    Write-Host "    Manuales: $manualCount" -ForegroundColor Yellow
    
    if ($automaticCount -eq 0 -and $triggers -and $triggers.Count -gt 0) {
        Write-Host "`n  Hay triggers configurados pero no se ven builds automaticos recientes" -ForegroundColor Yellow
        Write-Host "    Posibles causas:" -ForegroundColor Yellow
        Write-Host "    - El trigger esta deshabilitado" -ForegroundColor White
        Write-Host "    - No se han hecho pushes recientes" -ForegroundColor White
        Write-Host "    - El trigger no esta configurado correctamente" -ForegroundColor White
    }
} else {
    Write-Host "  No se encontraron builds" -ForegroundColor Yellow
}

Write-Host "`n3. Ultimo commit en GitHub:" -ForegroundColor Yellow
$lastCommit = git log --oneline -1 2>&1
if ($lastCommit) {
    Write-Host "  $lastCommit" -ForegroundColor White
} else {
    Write-Host "  No se pudo obtener el ultimo commit" -ForegroundColor Yellow
}

Write-Host "`n=== CONCLUSION ===" -ForegroundColor Cyan
if ($triggers -and $triggers.Count -gt 0) {
    $firstTrigger = $triggers[0]
    if (-not $firstTrigger.disabled) {
        Write-Host "Trigger configurado y habilitado" -ForegroundColor Green
        if ($automaticCount -gt 0) {
            Write-Host "Builds automaticos funcionando" -ForegroundColor Green
        } else {
            Write-Host "Trigger configurado pero no se ven builds automaticos recientes" -ForegroundColor Yellow
            Write-Host "  Verifica que:" -ForegroundColor Yellow
            Write-Host "  1. El trigger este habilitado" -ForegroundColor White
            Write-Host "  2. Haya conexion con GitHub" -ForegroundColor White
            Write-Host "  3. Los pushes se hagan a la rama correcta" -ForegroundColor White
        }
    } else {
        Write-Host "Trigger configurado pero esta DESHABILITADO" -ForegroundColor Red
    }
} else {
    Write-Host "No hay trigger automatico configurado" -ForegroundColor Red
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan
