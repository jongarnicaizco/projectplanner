# Script para verificar y configurar permisos de Pub/Sub
Write-Host "=== Configurando Permisos de Pub/Sub ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$pubsubProject = "smn-content-v2"
$service = "mfs-lead-generation-ai"
$region = "us-central1"
$topic = "mfs-gmail-leads"

# 1. Verificar permisos IAM del servicio
Write-Host "[1] Verificando permisos IAM del servicio Cloud Run..." -ForegroundColor Yellow
$iamOutput = gcloud run services get-iam-policy $service --region=$region --project=$project 2>&1
Write-Host $iamOutput

$hasAllUsers = $iamOutput -match "allUsers"
if ($hasAllUsers) {
    Write-Host "  ✓ Permiso público (allUsers) ya está configurado" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ No hay permiso público configurado" -ForegroundColor Yellow
    Write-Host "  Agregando permiso público..." -ForegroundColor Yellow
    $addResult = gcloud run services add-iam-policy-binding $service `
      --region=$region `
      --project=$project `
      --member="allUsers" `
      --role="roles/run.invoker" `
      2>&1
    
    Write-Host $addResult
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Permiso público agregado correctamente" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ Resultado: $addResult" -ForegroundColor Yellow
    }
}

Write-Host ""

# 2. Verificar si el topic existe
Write-Host "[2] Verificando topic de Pub/Sub..." -ForegroundColor Yellow
$topicCheck = gcloud pubsub topics describe $topic --project=$pubsubProject 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Topic '$topic' existe en proyecto '$pubsubProject'" -ForegroundColor Green
    Write-Host $topicCheck
} else {
    Write-Host "  ✗ Topic '$topic' NO existe en proyecto '$pubsubProject'" -ForegroundColor Red
    Write-Host "  Creando topic..." -ForegroundColor Yellow
    $createResult = gcloud pubsub topics create $topic --project=$pubsubProject 2>&1
    Write-Host $createResult
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Topic creado correctamente" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error al crear topic: $createResult" -ForegroundColor Red
    }
}

Write-Host ""

# 3. Verificar configuración de ingress
Write-Host "[3] Verificando configuración de ingress..." -ForegroundColor Yellow
$ingress = gcloud run services describe $service --region=$region --project=$project --format="value(spec.template.metadata.annotations.'run.googleapis.com/ingress')" 2>&1
Write-Host "  Ingress: $ingress" -ForegroundColor Gray

if ($ingress -eq "all" -or $ingress -eq "") {
    Write-Host "  ✓ Ingress configurado para permitir todas las invocaciones" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ Ingress puede estar restringido: $ingress" -ForegroundColor Yellow
}

Write-Host ""

# 4. Verificar que el servicio permite invocaciones no autenticadas
Write-Host "[4] Verificando configuración de autenticación..." -ForegroundColor Yellow
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($serviceInfo) {
    $annotations = $serviceInfo.spec.template.metadata.annotations
    $hasUnauth = $annotations.'run.googleapis.com/ingress' -eq "all" -or $hasAllUsers
    
    if ($hasUnauth -or $hasAllUsers) {
        Write-Host "  ✓ Servicio configurado para permitir invocaciones no autenticadas" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ Servicio puede requerir autenticación" -ForegroundColor Yellow
        Write-Host "  Actualizando servicio para permitir invocaciones no autenticadas..." -ForegroundColor Yellow
        $updateResult = gcloud run services update $service `
          --region=$region `
          --project=$project `
          --allow-unauthenticated `
          2>&1
        Write-Host $updateResult
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Servicio actualizado" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "=== Resumen ===" -ForegroundColor Cyan
Write-Host "1. Permiso público (allUsers): $(if ($hasAllUsers) { '✓ Configurado' } else { '✗ No configurado' })" -ForegroundColor $(if ($hasAllUsers) { 'Green' } else { 'Red' })
Write-Host "2. Topic existe: $(if ($LASTEXITCODE -eq 0) { '✓ Existe' } else { '✗ No existe' })" -ForegroundColor $(if ($LASTEXITCODE -eq 0) { 'Green' } else { 'Red' })
Write-Host "3. Ingress: $ingress" -ForegroundColor Gray
Write-Host ""
Write-Host "✓ Configuración completada" -ForegroundColor Green

