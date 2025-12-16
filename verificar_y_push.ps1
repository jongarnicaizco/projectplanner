# Script para verificar y hacer push de todos los cambios
$ErrorActionPreference = "Continue"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN Y PUSH DE CAMBIOS" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# 1. Verificar estado
Write-Host "[1] Estado del repositorio:" -ForegroundColor Yellow
$status = git status --short
if ($status) {
    Write-Host "Cambios pendientes:" -ForegroundColor Yellow
    Write-Host $status -ForegroundColor Gray
} else {
    Write-Host "✓ No hay cambios pendientes" -ForegroundColor Green
}

Write-Host ""

# 2. Verificar commits sin push
Write-Host "[2] Commits sin push:" -ForegroundColor Yellow
$unpushed = git log origin/main..HEAD --oneline 2>&1
if ($unpushed -and $unpushed.Count -gt 0) {
    Write-Host "Hay commits sin push:" -ForegroundColor Yellow
    Write-Host $unpushed -ForegroundColor Gray
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

Write-Host ""

# 3. Agregar todos los cambios
Write-Host "[3] Agregando todos los cambios..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Cambios agregados" -ForegroundColor Green
} else {
    Write-Host "✗ Error al agregar cambios" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 4. Verificar si hay algo para commitear
$statusAfterAdd = git status --short
if ($statusAfterAdd) {
    Write-Host "[4] Haciendo commit..." -ForegroundColor Yellow
    $commitMsg = "ELIMINAR AIRTABLE COMPLETAMENTE - Reemplazar con envío de emails

- Eliminado servicio de Airtable, creado servicio de email
- Reemplazado createAirtableRecord por sendLeadEmail
- Eliminada verificación de duplicados en Airtable
- Renombrado airtableData a emailData
- Eliminadas todas las referencias a Airtable en handlers
- Actualizado config.js y cloudbuild.yaml
- Los emails se envían desde media.manager@feverup.com a jongarnicaizco@gmail.com"
    
    git commit -m $commitMsg
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Commit realizado" -ForegroundColor Green
    } else {
        Write-Host "✗ Error al hacer commit" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[4] No hay cambios para commitear" -ForegroundColor Yellow
}

Write-Host ""

# 5. Hacer push
Write-Host "[5] Haciendo push a GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Push completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los cambios se desplegarán automáticamente vía Cloud Build" -ForegroundColor Cyan
} else {
    Write-Host "✗ Error al hacer push" -ForegroundColor Red
    Write-Host "Error code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Intentando push con autenticación directa..." -ForegroundColor Yellow
    $token = "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"
    $user = "jongarnicaizco"
    $remoteUrl = git remote get-url origin
    if ($remoteUrl -match "github.com/([^/]+)/([^/]+)") {
        $repo = $matches[2]
        $urlWithToken = "https://${user}:${token}@github.com/${user}/${repo}.git"
        git push $urlWithToken main
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Push completado con autenticación directa" -ForegroundColor Green
        } else {
            Write-Host "✗ Error en push con autenticación directa" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN FINAL" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan

# 6. Verificar que no hay commits sin push
$unpushedAfter = git log origin/main..HEAD --oneline 2>&1
if ($unpushedAfter -and $unpushedAfter.Count -gt 0) {
    Write-Host "⚠ Aún hay commits sin push:" -ForegroundColor Yellow
    Write-Host $unpushedAfter -ForegroundColor Gray
} else {
    Write-Host "✓ Todos los commits están pusheados" -ForegroundColor Green
}

# 7. Verificar archivos clave
Write-Host ""
Write-Host "[6] Verificando archivos clave:" -ForegroundColor Yellow

$filesToCheck = @(
    "services/email.js",
    "services/processor.js",
    "config.js",
    "cloudbuild.yaml"
)

foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file existe" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file NO existe" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "  COMPLETADO" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
