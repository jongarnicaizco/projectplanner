# Script final para corregir autenticación
Write-Host "`n=== Corrigiendo autenticación para Pub/Sub ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Verificar estado actual
Write-Host "`n1. Estado actual del servicio:" -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json
if ($serviceInfo) {
    Write-Host "  URL: $($serviceInfo.status.url)" -ForegroundColor Green
    Write-Host "  Latest Revision: $($serviceInfo.status.latestReadyRevisionName)" -ForegroundColor Green
}

# 2. Agregar permiso público
Write-Host "`n2. Agregando permiso público (allUsers)..." -ForegroundColor Yellow
$addPolicy = gcloud run services add-iam-policy-binding $service `
  --region=$region `
  --project=$project `
  --member="allUsers" `
  --role="roles/run.invoker" `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Permiso público agregado" -ForegroundColor Green
} else {
    Write-Host "  Resultado: $addPolicy" -ForegroundColor Gray
    if ($addPolicy -match "already") {
        Write-Host "  ✓ Permiso ya existía" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Verifica el resultado arriba" -ForegroundColor Yellow
    }
}

# 3. Permitir invocaciones no autenticadas
Write-Host "`n3. Configurando servicio para permitir invocaciones no autenticadas..." -ForegroundColor Yellow
$updateService = gcloud run services update $service `
  --region=$region `
  --project=$project `
  --allow-unauthenticated `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Servicio actualizado" -ForegroundColor Green
} else {
    Write-Host "  Resultado: $updateService" -ForegroundColor Gray
}

# 4. Verificar IAM policy
Write-Host "`n4. Verificando permisos IAM..." -ForegroundColor Yellow
$iamPolicy = gcloud run services get-iam-policy $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($iamPolicy.bindings) {
    $publicBinding = $iamPolicy.bindings | Where-Object { 
        $_.role -eq "roles/run.invoker" -and $_.members -contains "allUsers" 
    }
    if ($publicBinding) {
        Write-Host "  ✓ Permiso público configurado correctamente" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Permiso público NO encontrado" -ForegroundColor Red
        Write-Host "  Bindings encontrados:" -ForegroundColor Gray
        $iamPolicy.bindings | ForEach-Object {
            Write-Host "    Role: $($_.role), Members: $($_.members -join ', ')" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  ✗ No se encontraron bindings de IAM" -ForegroundColor Red
}

# 5. Verificar anotaciones del servicio
Write-Host "`n5. Verificando configuración del servicio..." -ForegroundColor Yellow
$annotations = $serviceInfo.metadata.annotations
if ($annotations.'run.googleapis.com/ingress') {
    Write-Host "  Ingress: $($annotations.'run.googleapis.com/ingress')" -ForegroundColor Gray
}

# 6. Resumen
Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "Si los comandos se ejecutaron correctamente:" -ForegroundColor Yellow
Write-Host "  ✓ Permiso público agregado (allUsers con roles/run.invoker)" -ForegroundColor Green
Write-Host "  ✓ Servicio configurado para permitir invocaciones no autenticadas" -ForegroundColor Green
Write-Host "`nEspera 1-2 minutos y verifica los logs. Los errores 403 deberían desaparecer." -ForegroundColor Yellow

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

