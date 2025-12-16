# Script para desplegar cambios a GitHub
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  Desplegando Cambios a GitHub" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Verificar estado
Write-Host "[1] Verificando estado del repositorio..." -ForegroundColor Yellow
$status = git status --short
if ($status) {
    Write-Host "Cambios pendientes:" -ForegroundColor Yellow
    Write-Host $status -ForegroundColor Gray
} else {
    Write-Host "✓ No hay cambios pendientes" -ForegroundColor Green
}

Write-Host ""

# Agregar cambios
Write-Host "[2] Agregando cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Cambios agregados" -ForegroundColor Green
} else {
    Write-Host "✗ Error al agregar cambios" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Verificar si hay algo para commitear
$statusAfterAdd = git status --short
if (-not $statusAfterAdd) {
    Write-Host "⚠ No hay cambios para commitear" -ForegroundColor Yellow
    Write-Host "Verificando si hay commits sin push..." -ForegroundColor Yellow
    
    $ahead = git rev-list --count origin/main..HEAD 2>&1
    if ($ahead -and $ahead -gt 0) {
        Write-Host "✓ Hay $ahead commit(s) sin push" -ForegroundColor Green
    } else {
        Write-Host "✓ Todo está sincronizado" -ForegroundColor Green
        exit 0
    }
} else {
    # Hacer commit
    Write-Host "[3] Haciendo commit..." -ForegroundColor Yellow
    $commitMsg = "Fix: Priorizar email del To header aunque no tenga dominio válido

- Corrige bug donde from y to eran iguales incorrectamente
- Ahora usa el email del To header directamente si existe
- Solo busca en CC/BCC/Reply-To si el To está vacío
- Esto resuelve el problema de emails no procesados en Airtable"
    
    git commit -m $commitMsg
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Commit realizado" -ForegroundColor Green
    } else {
        Write-Host "✗ Error al hacer commit" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Hacer push
Write-Host "[4] Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Push completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios se desplegarán automáticamente vía Cloud Build" -ForegroundColor Cyan
} else {
    Write-Host "✗ Error al hacer push" -ForegroundColor Red
    Write-Host "Error code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  Despliegue Completado" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan

