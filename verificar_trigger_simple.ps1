# Script simple para verificar trigger
$ErrorActionPreference = "Continue"

Write-Host "`n=== TRIGGER AUTOMATICO ===" -ForegroundColor Cyan

Write-Host "`n1. Trigger configurado:" -ForegroundColor Yellow
$trigger = gcloud builds triggers list --project=check-in-sf --filter="name:rmgpgab-mfs-lead-generation-ai" --format=json 2>&1 | ConvertFrom-Json | Select-Object -First 1

if ($trigger) {
    Write-Host "  [OK] Trigger encontrado: $($trigger.name)" -ForegroundColor Green
    Write-Host "    Repositorio: $($trigger.github.owner)/$($trigger.github.name)" -ForegroundColor White
    Write-Host "    Rama: $($trigger.github.push.branch)" -ForegroundColor White
    Write-Host "    Archivo: $($trigger.filename)" -ForegroundColor White
} else {
    Write-Host "  [ERROR] No se encontro el trigger" -ForegroundColor Red
}

Write-Host "`n2. Builds recientes:" -ForegroundColor Yellow
$builds = gcloud builds list --project=check-in-sf --limit=5 --format=json 2>&1 | ConvertFrom-Json

foreach ($build in $builds) {
    $source = "Manual"
    if ($build.source.repoSource) {
        $source = "GitHub: $($build.source.repoSource.branchName)"
    }
    
    $statusColor = if ($build.status -eq "SUCCESS") { "Green" } elseif ($build.status -eq "FAILURE") { "Red" } else { "Yellow" }
    
    Write-Host "  [$($build.id.Substring(0,8))...] $($build.status) - $source" -ForegroundColor $statusColor
}

Write-Host "`n=== FIN ===" -ForegroundColor Cyan

