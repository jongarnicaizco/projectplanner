# Script para verificar y configurar permisos de Pub/Sub
Write-Host "=== Verificando Permisos de Pub/Sub ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$pubsubProject = "smn-content-v2"
$service = "mfs-lead-generation-ai"
$region = "us-central1"
$topic = "mfs-gmail-leads"

# 1. Verificar si el servicio permite invocaciones no autenticadas
Write-Host "[1] Verificando permisos IAM del servicio Cloud Run..." -ForegroundColor Yellow
$iamPolicy = gcloud run services get-iam-policy $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

$hasPublicAccess = $false
if ($iamPolicy.bindings) {
    foreach ($binding in $iamPolicy.bindings) {
        if ($binding.role -eq "roles/run.invoker") {
            if ($binding.members -contains "allUsers") {
                $hasPublicAccess = $true
                Write-Host "  ✓ Permiso público (allUsers) configurado" -ForegroundColor Green
            } else {
                Write-Host "  Miembros con rol run.invoker:" -ForegroundColor Gray
                foreach ($member in $binding.members) {
                    Write-Host "    - $member" -ForegroundColor Gray
                }
            }
        }
    }
}

if (-not $hasPublicAccess) {
    Write-Host "  ⚠️ No hay permiso público (allUsers)" -ForegroundColor Yellow
    Write-Host "  Esto puede impedir que Pub/Sub invoque el servicio" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ¿Agregar permiso público? (S/N)" -ForegroundColor Cyan
    $response = Read-Host
    if ($response -eq "S" -or $response -eq "s") {
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
    }
}

Write-Host ""

# 2. Verificar si el topic existe
Write-Host "[2] Verificando topic de Pub/Sub..." -ForegroundColor Yellow
$topicInfo = gcloud pubsub topics describe $topic --project=$pubsubProject --format="json" 2>&1 | ConvertFrom-Json

if ($topicInfo) {
    Write-Host "  ✓ Topic '$topic' existe en proyecto '$pubsubProject'" -ForegroundColor Green
    Write-Host "    Nombre completo: $($topicInfo.name)" -ForegroundColor Gray
} else {
    Write-Host "  ✗ Topic '$topic' NO existe en proyecto '$pubsubProject'" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ¿Crear el topic? (S/N)" -ForegroundColor Cyan
    $response = Read-Host
    if ($response -eq "S" -or $response -eq "s") {
        Write-Host "  Creando topic..." -ForegroundColor Yellow
        gcloud pubsub topics create $topic --project=$pubsubProject 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Topic creado" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Error al crear topic" -ForegroundColor Red
        }
    }
}

Write-Host ""

# 3. Verificar permisos del servicio de Cloud Run para acceder a Pub/Sub
Write-Host "[3] Verificando permisos del servicio para acceder a Pub/Sub..." -ForegroundColor Yellow

# Obtener la cuenta de servicio del servicio
$serviceInfo = gcloud run services describe $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json
$serviceAccount = $serviceInfo.spec.template.spec.serviceAccountName

if (-not $serviceAccount) {
    # Si no tiene cuenta de servicio específica, usa la cuenta por defecto
    $projectNumber = (gcloud projects describe $project --format="value(projectNumber)" 2>&1)
    $serviceAccount = "$projectNumber-compute@developer.gserviceaccount.com"
}

Write-Host "  Cuenta de servicio: $serviceAccount" -ForegroundColor Gray

# Verificar permisos en el proyecto de Pub/Sub
$pubsubIam = gcloud projects get-iam-policy $pubsubProject --format="json" 2>&1 | ConvertFrom-Json
$hasPubSubPermission = $false

if ($pubsubIam.bindings) {
    foreach ($binding in $pubsubIam.bindings) {
        if ($binding.members -contains "serviceAccount:$serviceAccount") {
            if ($binding.role -eq "roles/pubsub.subscriber" -or 
                $binding.role -eq "roles/pubsub.editor" -or 
                $binding.role -eq "roles/pubsub.admin") {
                $hasPubSubPermission = $true
                Write-Host "  ✓ Tiene permiso: $($binding.role)" -ForegroundColor Green
            }
        }
    }
}

if (-not $hasPubSubPermission) {
    Write-Host "  ⚠️ No tiene permisos explícitos en Pub/Sub" -ForegroundColor Yellow
    Write-Host "  (Puede que funcione si la cuenta tiene permisos heredados)" -ForegroundColor Gray
}

Write-Host ""

# 4. Verificar permisos de la cuenta de servicio de Pub/Sub para invocar Cloud Run
Write-Host "[4] Verificando permisos de Pub/Sub para invocar Cloud Run..." -ForegroundColor Yellow

# La cuenta de servicio de Pub/Sub que invoca Cloud Run
$pubsubServiceAccount = "service-$projectNumber@gcp-sa-pubsub.iam.gserviceaccount.com"

Write-Host "  Cuenta de servicio de Pub/Sub: $pubsubServiceAccount" -ForegroundColor Gray

$hasInvokerPermission = $false
if ($iamPolicy.bindings) {
    foreach ($binding in $iamPolicy.bindings) {
        if ($binding.role -eq "roles/run.invoker") {
            if ($binding.members -contains "serviceAccount:$pubsubServiceAccount") {
                $hasInvokerPermission = $true
                Write-Host "  ✓ Pub/Sub tiene permiso para invocar el servicio" -ForegroundColor Green
            }
        }
    }
}

if (-not $hasInvokerPermission -and -not $hasPublicAccess) {
    Write-Host "  ⚠️ Pub/Sub NO tiene permiso explícito para invocar" -ForegroundColor Yellow
    Write-Host "  Esto puede impedir que las notificaciones lleguen al servicio" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ¿Agregar permiso a Pub/Sub? (S/N)" -ForegroundColor Cyan
    $response = Read-Host
    if ($response -eq "S" -or $response -eq "s") {
        Write-Host "  Agregando permiso..." -ForegroundColor Yellow
        gcloud run services add-iam-policy-binding $service `
          --region=$region `
          --project=$project `
          --member="serviceAccount:$pubsubServiceAccount" `
          --role="roles/run.invoker" `
          --quiet 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Permiso agregado" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Error al agregar permiso" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "=== Resumen ===" -ForegroundColor Cyan
Write-Host "1. Permiso público (allUsers): $(if ($hasPublicAccess) { '✓' } else { '✗' })" -ForegroundColor $(if ($hasPublicAccess) { 'Green' } else { 'Red' })
Write-Host "2. Topic existe: $(if ($topicInfo) { '✓' } else { '✗' })" -ForegroundColor $(if ($topicInfo) { 'Green' } else { 'Red' })
Write-Host "3. Permisos Pub/Sub: $(if ($hasPubSubPermission) { '✓' } else { '⚠️' })" -ForegroundColor $(if ($hasPubSubPermission) { 'Green' } else { 'Yellow' })
Write-Host "4. Pub/Sub puede invocar: $(if ($hasInvokerPermission -or $hasPublicAccess) { '✓' } else { '✗' })" -ForegroundColor $(if ($hasInvokerPermission -or $hasPublicAccess) { 'Green' } else { 'Red' })

