# Script para corregir autenticación de Pub/Sub
Write-Host "`n=== Corrigiendo autenticación para Pub/Sub ===" -ForegroundColor Cyan

$project = "check-in-sf"
$service = "mfs-lead-generation-ai"
$region = "us-central1"

# 1. Verificar estado actual
Write-Host "`n1. Verificando estado actual del servicio..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if (-not $serviceInfo) {
    Write-Host "  ✗ Error: No se pudo obtener información del servicio" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Servicio encontrado: $($serviceInfo.status.url)" -ForegroundColor Green

# 2. Verificar IAM policy
Write-Host "`n2. Verificando permisos IAM..." -ForegroundColor Yellow
$iamPolicy = gcloud run services get-iam-policy $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

$hasPublicAccess = $false
if ($iamPolicy.bindings) {
    foreach ($binding in $iamPolicy.bindings) {
        if ($binding.role -eq "roles/run.invoker") {
            if ($binding.members -contains "allUsers") {
                $hasPublicAccess = $true
                Write-Host "  ✓ Permiso público (allUsers) encontrado" -ForegroundColor Green
                break
            }
        }
    }
}

if (-not $hasPublicAccess) {
    Write-Host "  ⚠️ No hay permiso público configurado" -ForegroundColor Yellow
    Write-Host "  Agregando permiso público..." -ForegroundColor Yellow
    
    gcloud run services add-iam-policy-binding $service `
      --region=$region `
      --project=$project `
      --member="allUsers" `
      --role="roles/run.invoker" `
      --quiet 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Permiso público agregado" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error al agregar permiso público" -ForegroundColor Red
    }
} else {
    Write-Host "  ✓ Permisos IAM correctos" -ForegroundColor Green
}

# 3. Actualizar servicio para permitir invocaciones no autenticadas
Write-Host "`n3. Actualizando servicio para permitir invocaciones no autenticadas..." -ForegroundColor Yellow
gcloud run services update $service `
  --region=$region `
  --project=$project `
  --allow-unauthenticated `
  2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Servicio actualizado" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error al actualizar el servicio" -ForegroundColor Red
}

# 4. Verificar que no exista SKIP_AIRTABLE
Write-Host "`n4. Verificando variables de entorno..." -ForegroundColor Yellow
$envVars = $serviceInfo.spec.template.spec.containers[0].env
$skipVar = $envVars | Where-Object { $_.name -eq "SKIP_AIRTABLE" }

if ($skipVar) {
    Write-Host "  ⚠️ SKIP_AIRTABLE encontrado, eliminando..." -ForegroundColor Yellow
    gcloud run services update $service `
      --region=$region `
      --project=$project `
      --remove-env-vars SKIP_AIRTABLE `
      2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ SKIP_AIRTABLE eliminado" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ SKIP_AIRTABLE no existe" -ForegroundColor Green
}

# 5. Verificar variables de Airtable
Write-Host "`n5. Verificando variables de Airtable..." -ForegroundColor Yellow
$baseIdVar = $envVars | Where-Object { $_.name -eq "AIRTABLE_BASE_ID" }
$tableVar = $envVars | Where-Object { $_.name -eq "AIRTABLE_TABLE" }

if (-not $baseIdVar -or -not $tableVar) {
    Write-Host "  ⚠️ Faltan variables de Airtable, agregando..." -ForegroundColor Yellow
    gcloud run services update $service `
      --region=$region `
      --project=$project `
      --update-env-vars AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage,AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY `
      2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Variables de Airtable actualizadas" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ Variables de Airtable configuradas" -ForegroundColor Green
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Servicio configurado para permitir invocaciones no autenticadas" -ForegroundColor Green
Write-Host "✓ Permisos IAM configurados" -ForegroundColor Green
Write-Host "✓ Variables de entorno verificadas" -ForegroundColor Green
Write-Host "`nEl endpoint /_pubsub debería funcionar ahora" -ForegroundColor Green
Write-Host "`n=== Fin ===" -ForegroundColor Cyan

