# Script completo para configurar Pub/Sub
$ErrorActionPreference = "Continue"

Write-Host "=== Configurando Permisos de Pub/Sub ===" -ForegroundColor Cyan
Write-Host ""

$project = "check-in-sf"
$pubsubProject = "smn-content-v2"
$service = "mfs-lead-generation-ai"
$region = "us-central1"
$topic = "mfs-gmail-leads"
$subscription = "mfs-gmail-leads-sub"
$serviceUrl = "https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app/_pubsub"

# 1. Agregar permiso público
Write-Host "[1] Agregando permiso público al servicio Cloud Run..." -ForegroundColor Yellow
$result1 = gcloud run services add-iam-policy-binding $service `
  --region=$region `
  --project=$project `
  --member="allUsers" `
  --role="roles/run.invoker" `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Permiso público agregado" -ForegroundColor Green
} else {
    if ($result1 -match "already exists" -or $result1 -match "already has") {
        Write-Host "  ✓ Permiso público ya estaba configurado" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ Resultado: $result1" -ForegroundColor Yellow
    }
}

Write-Host ""

# 2. Crear topic
Write-Host "[2] Creando topic de Pub/Sub en $pubsubProject..." -ForegroundColor Yellow
$result2 = gcloud pubsub topics create $topic --project=$pubsubProject 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Topic '$topic' creado" -ForegroundColor Green
} else {
    if ($result2 -match "already exists" -or $result2 -match "Resource already exists") {
        Write-Host "  ✓ Topic '$topic' ya existe" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error: $result2" -ForegroundColor Red
    }
}

Write-Host ""

# 3. Crear subscription
Write-Host "[3] Creando subscription de Pub/Sub en $pubsubProject..." -ForegroundColor Yellow
$result3 = gcloud pubsub subscriptions create $subscription `
  --topic=$topic `
  --project=$pubsubProject `
  --push-endpoint=$serviceUrl `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Subscription '$subscription' creada" -ForegroundColor Green
} else {
    if ($result3 -match "already exists" -or $result3 -match "Resource already exists") {
        Write-Host "  ✓ Subscription '$subscription' ya existe" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Error: $result3" -ForegroundColor Red
    }
}

Write-Host ""

# 4. Configurar servicio para invocaciones no autenticadas
Write-Host "[4] Configurando servicio para permitir invocaciones no autenticadas..." -ForegroundColor Yellow
$result4 = gcloud run services update $service `
  --region=$region `
  --project=$project `
  --allow-unauthenticated `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Servicio configurado" -ForegroundColor Green
} else {
    if ($result4 -match "already" -or $result4 -match "No change") {
        Write-Host "  ✓ Servicio ya estaba configurado" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ Resultado: $result4" -ForegroundColor Yellow
    }
}

Write-Host ""

# 5. Verificar permisos IAM
Write-Host "[5] Verificando permisos IAM del servicio..." -ForegroundColor Yellow
$iamPolicy = gcloud run services get-iam-policy $service --region=$region --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($iamPolicy.bindings) {
    $hasAllUsers = $false
    foreach ($binding in $iamPolicy.bindings) {
        if ($binding.role -eq "roles/run.invoker") {
            if ($binding.members -contains "allUsers") {
                $hasAllUsers = $true
                Write-Host "  ✓ Permiso público (allUsers) configurado" -ForegroundColor Green
            } else {
                Write-Host "  Miembros con rol run.invoker:" -ForegroundColor Gray
                foreach ($member in $binding.members) {
                    Write-Host "    - $member" -ForegroundColor Gray
                }
            }
        }
    }
    if (-not $hasAllUsers) {
        Write-Host "  ⚠️ No se encontró permiso público (allUsers)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️ No se encontraron bindings de IAM" -ForegroundColor Yellow
}

Write-Host ""

# 6. Verificar topic
Write-Host "[6] Verificando topic..." -ForegroundColor Yellow
$topicInfo = gcloud pubsub topics describe $topic --project=$pubsubProject --format="json" 2>&1 | ConvertFrom-Json

if ($topicInfo) {
    Write-Host "  ✓ Topic existe: $($topicInfo.name)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Topic no encontrado" -ForegroundColor Red
}

Write-Host ""

# 7. Verificar subscription
Write-Host "[7] Verificando subscription..." -ForegroundColor Yellow
$subInfo = gcloud pubsub subscriptions describe $subscription --project=$pubsubProject --format="json" 2>&1 | ConvertFrom-Json

if ($subInfo) {
    Write-Host "  ✓ Subscription existe: $($subInfo.name)" -ForegroundColor Green
    Write-Host "    Topic: $($subInfo.topic)" -ForegroundColor Gray
    if ($subInfo.pushConfig) {
        Write-Host "    Push endpoint: $($subInfo.pushConfig.pushEndpoint)" -ForegroundColor Gray
    }
} else {
    Write-Host "  ✗ Subscription no encontrada" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Configuración completada" -ForegroundColor Green
Write-Host ""
Write-Host "Topic: projects/$pubsubProject/topics/$topic" -ForegroundColor Gray
Write-Host "Subscription: projects/$pubsubProject/subscriptions/$subscription" -ForegroundColor Gray
Write-Host "Service: $service en $project" -ForegroundColor Gray

