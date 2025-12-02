# Script para verificar y crear trigger de Cloud Build
Write-Host "`n=== Verificando triggers de Cloud Build ===" -ForegroundColor Cyan

$project = "check-in-sf"
$region = "us-central1"

# Verificar triggers existentes
Write-Host "`nBuscando triggers existentes..." -ForegroundColor Yellow
$triggers = gcloud builds triggers list --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($triggers -and $triggers.Count -gt 0) {
    Write-Host "`nTriggers encontrados:" -ForegroundColor Green
    $triggers | ForEach-Object {
        Write-Host "  - $($_.name) (Status: $($_.status))" -ForegroundColor Green
        if ($_.github) {
            Write-Host "    Repo: $($_.github.owner)/$($_.github.name)" -ForegroundColor Gray
            Write-Host "    Branch: $($_.github.push.branch)" -ForegroundColor Gray
        }
    }
    
    $mfsTrigger = $triggers | Where-Object { $_.name -like "*mfs*" -or ($_.github -and $_.github.name -eq "mfs-lead-generation-ai") }
    if ($mfsTrigger) {
        Write-Host "`n✓ Trigger para mfs-lead-generation-ai encontrado!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠ No se encontró trigger específico para mfs-lead-generation-ai" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n⚠ No hay triggers configurados" -ForegroundColor Yellow
}

# Verificar conexión con GitHub
Write-Host "`nVerificando conexión con GitHub..." -ForegroundColor Yellow
$connections = gcloud builds connections list --project=$project --region=$region --format="json" 2>&1 | ConvertFrom-Json

if ($connections -and $connections.Count -gt 0) {
    Write-Host "Conexiones encontradas:" -ForegroundColor Green
    $connections | ForEach-Object {
        Write-Host "  - $($_.name) (Type: $($_.githubConfig.appInstallationUri))" -ForegroundColor Green
    }
} else {
    Write-Host "⚠ No hay conexión con GitHub configurada" -ForegroundColor Yellow
    Write-Host "`nPara crear la conexión, ejecuta:" -ForegroundColor Cyan
    Write-Host "  gcloud builds connections create github --region=$region --project=$project" -ForegroundColor White
}

# Verificar builds recientes
Write-Host "`nVerificando builds recientes..." -ForegroundColor Yellow
$builds = gcloud builds list --project=$project --limit=3 --format="json" 2>&1 | ConvertFrom-Json

if ($builds -and $builds.Count -gt 0) {
    Write-Host "Builds recientes:" -ForegroundColor Green
    $builds | ForEach-Object {
        $status = $_.status
        $color = if ($status -eq "SUCCESS") { "Green" } elseif ($status -eq "WORKING") { "Yellow" } else { "Red" }
        Write-Host "  - $($_.id) [$status] - $($_.createTime)" -ForegroundColor $color
        if ($_.source.repoSource) {
            Write-Host "    Branch: $($_.source.repoSource.branchName) - Commit: $($_.source.repoSource.commitSha.Substring(0,7))" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "⚠ No hay builds recientes" -ForegroundColor Yellow
}

Write-Host "`n=== Fin de verificación ===" -ForegroundColor Cyan

