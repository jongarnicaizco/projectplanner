# Script completo para ver salidas de Google Cloud y GitHub
$ErrorActionPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

Write-Host "`n" -NoNewline
Write-Host "="*80 -ForegroundColor Cyan
Write-Host "VERIFICACIÓN DE GOOGLE CLOUD Y GITHUB" -ForegroundColor Cyan
Write-Host "="*80 -ForegroundColor Cyan

# ============================================
# GOOGLE CLOUD
# ============================================
Write-Host "`n" -NoNewline
Write-Host "="*80 -ForegroundColor Yellow
Write-Host "GOOGLE CLOUD" -ForegroundColor Yellow
Write-Host "="*80 -ForegroundColor Yellow

Write-Host "`n1. Proyecto actual:" -ForegroundColor Green
try {
    $project = gcloud config get-value project 2>&1
    Write-Host $project
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n2. Builds recientes (últimos 5):" -ForegroundColor Green
try {
    gcloud builds list --project=check-in-sf --limit=5 --format="table(id,status,createTime,source.repoSource.branchName)" 2>&1
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n3. Builds en progreso:" -ForegroundColor Green
try {
    $ongoing = gcloud builds list --project=check-in-sf --ongoing --format="table(id,status,createTime)" 2>&1
    if ($ongoing) {
        Write-Host $ongoing
    } else {
        Write-Host "No hay builds en progreso" -ForegroundColor Gray
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n4. Triggers de Cloud Build:" -ForegroundColor Green
try {
    gcloud builds triggers list --project=check-in-sf --format="table(name,github.repo,github.branch,status)" 2>&1
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n5. Servicio Cloud Run (mfs-lead-generation-ai):" -ForegroundColor Green
try {
    $service = gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(status.latestReadyRevisionName,status.latestCreatedRevisionName)" 2>&1
    Write-Host "Última revisión lista: $service"
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n6. Revisiones recientes:" -ForegroundColor Green
try {
    gcloud run revisions list --service=mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --limit=3 --format="table(name,status,created)" 2>&1
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

# ============================================
# GITHUB
# ============================================
Write-Host "`n" -NoNewline
Write-Host "="*80 -ForegroundColor Yellow
Write-Host "GITHUB" -ForegroundColor Yellow
Write-Host "="*80 -ForegroundColor Yellow

Write-Host "`n1. Remoto configurado:" -ForegroundColor Green
try {
    git remote -v 2>&1
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n2. Estado del repositorio:" -ForegroundColor Green
try {
    git status 2>&1
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n3. Últimos 5 commits:" -ForegroundColor Green
try {
    git log --oneline -5 2>&1
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n4. Conexión con GitHub:" -ForegroundColor Green
try {
    $remote = git ls-remote origin HEAD 2>&1
    Write-Host $remote
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n5. Commits locales vs remotos:" -ForegroundColor Green
try {
    $local = git log --oneline origin/main..HEAD 2>&1
    $remote = git log --oneline HEAD..origin/main 2>&1
    
    if ($local) {
        Write-Host "Commits locales no pusheados:" -ForegroundColor Yellow
        Write-Host $local
    } else {
        Write-Host "No hay commits locales sin pushear" -ForegroundColor Gray
    }
    
    if ($remote) {
        Write-Host "`nCommits remotos no descargados:" -ForegroundColor Yellow
        Write-Host $remote
    } else {
        Write-Host "No hay commits remotos sin descargar" -ForegroundColor Gray
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n" -NoNewline
Write-Host "="*80 -ForegroundColor Cyan
Write-Host "FIN DE VERIFICACIÓN" -ForegroundColor Cyan
Write-Host "="*80 -ForegroundColor Cyan
Write-Host "`n"

