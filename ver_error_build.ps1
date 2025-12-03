# Script para ver el error del build
$ErrorActionPreference = "Continue"

$project = "check-in-sf"
$buildId = "41e3a365-8d05-4a9d-b3a8-24e30bf06c8c"

Write-Host "`n=== ERROR DEL BUILD ===" -ForegroundColor Cyan

Write-Host "`n1. Informacion del build:" -ForegroundColor Yellow
$build = gcloud builds describe $buildId --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($build) {
    Write-Host "  Estado: $($build.status)" -ForegroundColor $(if ($build.status -eq "FAILURE") { "Red" } else { "Green" })
    Write-Host "  Creado: $($build.createTime)" -ForegroundColor White
    
    if ($build.failureInfo) {
        Write-Host "`n  Error:" -ForegroundColor Red
        Write-Host "    $($build.failureInfo.message)" -ForegroundColor Red
    }
    
    if ($build.steps) {
        Write-Host "`n2. Pasos del build:" -ForegroundColor Yellow
        foreach ($step in $build.steps) {
            $stepStatus = $step.status
            $stepColor = if ($stepStatus -eq "SUCCESS") { "Green" } elseif ($stepStatus -eq "FAILURE") { "Red" } else { "Yellow" }
            Write-Host "    $($step.id): $stepStatus" -ForegroundColor $stepColor
            
            if ($stepStatus -eq "FAILURE" -and $step.logs) {
                Write-Host "      Logs disponibles" -ForegroundColor Gray
            }
        }
    }
    
    if ($build.logUrl) {
        Write-Host "`n3. URL del log completo:" -ForegroundColor Yellow
        Write-Host "    $($build.logUrl)" -ForegroundColor Cyan
    }
}

Write-Host "`n4. Ultimas lineas del log:" -ForegroundColor Yellow
$logLines = gcloud builds log $buildId --project=$project 2>&1 | Select-Object -Last 30
Write-Host $logLines -ForegroundColor White

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

