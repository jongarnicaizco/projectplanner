# Script mejorado para forzar el push
# Este script se ejecuta automáticamente desde Cursor AI para hacer push
# Uso: .\forzar-push-mejorado.ps1 [mensaje-commit]

param(
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "Update: Cambios automáticos desde Cursor AI - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FORZAR PUSH A GITHUB - MEJORADO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Configurar remoto con token PRIMERO
Write-Host "[1/5] Configurando remoto con token..." -ForegroundColor Yellow
$token = "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"
$remoteUrl = "https://jongarnicaizco:$token@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteUrl
$currentRemote = git remote get-url origin
Write-Host "  Remoto configurado: $($currentRemote -replace $token, '***TOKEN***')" -ForegroundColor Gray
Write-Host "  ✓ Remoto configurado" -ForegroundColor Green

# Verificar estado
Write-Host "`n[2/5] Verificando estado..." -ForegroundColor Yellow
git fetch origin 2>&1 | Out-Null
$localCommit = git rev-parse HEAD
$remoteCommit = git rev-parse origin/main 2>&1

Write-Host "  Commit local:  $localCommit" -ForegroundColor Gray
Write-Host "  Commit remoto: $remoteCommit" -ForegroundColor Gray

if ($localCommit -eq $remoteCommit) {
    Write-Host "  ⚠ Ya están sincronizados" -ForegroundColor Yellow
    Write-Host "  Verificando si hay cambios sin commitear..." -ForegroundColor Gray
} else {
    Write-Host "  ✓ Hay commits locales sin push" -ForegroundColor Green
}

# Añadir todos los cambios
Write-Host "`n[3/5] Añadiendo todos los cambios..." -ForegroundColor Yellow
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "  ⚠ No hay cambios para commitear" -ForegroundColor Yellow
    $hasChanges = $false
} else {
    Write-Host "  ✓ Hay cambios para commitear:" -ForegroundColor Green
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    git add -A
    Write-Host "  ✓ Cambios añadidos al staging" -ForegroundColor Green
    $hasChanges = $true
}

# Hacer commit si hay cambios
if ($hasChanges) {
    Write-Host "`n[4/5] Haciendo commit..." -ForegroundColor Yellow
    Write-Host "  Mensaje: $CommitMessage" -ForegroundColor Gray
    $commitOutput = git commit -m $CommitMessage 2>&1
    $commitStatus = $LASTEXITCODE
    if ($commitStatus -eq 0) {
        $lastCommit = git log --oneline -1
        Write-Host "  ✓ Commit realizado: $lastCommit" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error en commit:" -ForegroundColor Red
        $commitOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        exit 1
    }
} else {
    Write-Host "`n[4/5] Saltando commit (no hay cambios nuevos)" -ForegroundColor Yellow
    # Verificar si hay commits sin push
    git fetch origin 2>&1 | Out-Null
    $localCommits = git log origin/main..HEAD --oneline
    if ([string]::IsNullOrWhiteSpace($localCommits)) {
        Write-Host "  ⚠ No hay nada para subir" -ForegroundColor Yellow
        exit 0
    } else {
        Write-Host "  ✓ Hay commits locales sin push:" -ForegroundColor Green
        $localCommits | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    }
}

# Hacer push
Write-Host "`n[5/5] Haciendo push a GitHub..." -ForegroundColor Yellow
Write-Host "  Esto puede tardar unos segundos..." -ForegroundColor Gray

# Capturar tanto stdout como stderr
$pushOutput = git push origin main 2>&1 | Tee-Object -Variable pushResult
$pushStatus = $LASTEXITCODE

Write-Host ""
Write-Host "Salida completa del push:" -ForegroundColor Cyan
$pushOutput | ForEach-Object { 
    if ($_ -match "error|fatal|denied|invalid|failed") {
        Write-Host "  $_" -ForegroundColor Red
    } else {
        Write-Host "  $_" -ForegroundColor White
    }
}

Write-Host ""
if ($pushStatus -eq 0) {
    Write-Host "  ✓ PUSH EXITOSO!" -ForegroundColor Green
    
    # Verificar
    Write-Host "`nVerificando sincronización..." -ForegroundColor Yellow
    git fetch origin 2>&1 | Out-Null
    $newLocal = git rev-parse HEAD
    $newRemote = git rev-parse origin/main
    
    Write-Host "  Local:  $newLocal" -ForegroundColor Gray
    Write-Host "  Remoto: $newRemote" -ForegroundColor Gray
    
    if ($newLocal -eq $newRemote) {
        Write-Host "  ✓ Confirmado: commits sincronizados" -ForegroundColor Green
        Write-Host "  Los cambios están en GitHub ahora" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Los commits aún son diferentes" -ForegroundColor Yellow
        Write-Host "  Puede que necesites hacer push manualmente" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ ERROR EN PUSH" -ForegroundColor Red
    Write-Host "  Exit code: $pushStatus" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Posibles soluciones:" -ForegroundColor Yellow
    Write-Host "  1. Verifica que el token de GitHub sea válido" -ForegroundColor Yellow
    Write-Host "  2. Verifica que tengas permisos de escritura en el repositorio" -ForegroundColor Yellow
    Write-Host "  3. Ejecuta manualmente: git push origin main" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Verifica en GitHub:" -ForegroundColor Cyan
Write-Host "https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor Cyan
Write-Host ""

