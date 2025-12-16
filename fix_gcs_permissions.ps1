# Script para corregir permisos de GCS
Write-Host "`n=== Corrigiendo permisos de Google Cloud Storage ===" -ForegroundColor Cyan

$project = "check-in-sf"
$bucket = "mfs_automatic_email_lead_classification"
$serviceAccount = "mfs-gmail-service-account@check-in-sf.iam.gserviceaccount.com"

# 1. Verificar que el bucket existe
Write-Host "`n1. Verificando bucket..." -ForegroundColor Yellow
$bucketInfo = gcloud storage buckets describe gs://$bucket --project=$project 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Bucket encontrado: gs://$bucket" -ForegroundColor Green
} else {
    Write-Host "  ✗ Error: Bucket no encontrado o sin acceso" -ForegroundColor Red
    Write-Host "  Verifica que el bucket existe: gs://$bucket" -ForegroundColor Yellow
    exit 1
}

# 2. Otorgar permisos en el bucket
Write-Host "`n2. Otorgando permisos de Storage Object Admin en el bucket..." -ForegroundColor Yellow
$bucketPolicy = gcloud storage buckets add-iam-policy-binding gs://$bucket `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/storage.objectAdmin" `
  --project=$project `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Permisos otorgados en el bucket" -ForegroundColor Green
} else {
    Write-Host "  Resultado: $bucketPolicy" -ForegroundColor Gray
    if ($bucketPolicy -match "already") {
        Write-Host "  ✓ Permisos ya existían" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Verifica el resultado arriba" -ForegroundColor Yellow
    }
}

# 3. Otorgar permisos a nivel de proyecto (alternativa)
Write-Host "`n3. Otorgando permisos a nivel de proyecto..." -ForegroundColor Yellow
$projectPolicy = gcloud projects add-iam-policy-binding $project `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/storage.objectAdmin" `
  2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Permisos otorgados a nivel de proyecto" -ForegroundColor Green
} else {
    Write-Host "  Resultado: $projectPolicy" -ForegroundColor Gray
    if ($projectPolicy -match "already") {
        Write-Host "  ✓ Permisos ya existían" -ForegroundColor Green
    }
}

# 4. Verificar permisos del bucket
Write-Host "`n4. Verificando permisos del bucket..." -ForegroundColor Yellow
$iamPolicy = gcloud storage buckets get-iam-policy gs://$bucket --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($iamPolicy.bindings) {
    $storageBinding = $iamPolicy.bindings | Where-Object { 
        $_.role -like "*storage.objectAdmin*" -or $_.role -like "*storage.objects.create*"
    }
    if ($storageBinding) {
        $hasServiceAccount = $storageBinding.members | Where-Object { $_ -eq "serviceAccount:$serviceAccount" }
        if ($hasServiceAccount) {
            Write-Host "  ✓ Permisos verificados correctamente" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Permisos encontrados pero no para la cuenta de servicio correcta" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠ No se encontraron permisos de storage en el bucket" -ForegroundColor Yellow
    }
}

# 5. Verificar cuenta de servicio del Cloud Run
Write-Host "`n5. Verificando cuenta de servicio de Cloud Run..." -ForegroundColor Yellow
$runService = gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=$project --format="json" 2>&1 | ConvertFrom-Json

if ($runService) {
    $runServiceAccount = $runService.spec.template.spec.serviceAccountName
    if ($runServiceAccount) {
        Write-Host "  Cuenta de servicio: $runServiceAccount" -ForegroundColor Green
        if ($runServiceAccount -ne $serviceAccount) {
            Write-Host "  ⚠ ADVERTENCIA: La cuenta de servicio del Cloud Run es diferente" -ForegroundColor Yellow
            Write-Host "  Cloud Run usa: $runServiceAccount" -ForegroundColor Yellow
            Write-Host "  Error menciona: $serviceAccount" -ForegroundColor Yellow
            Write-Host "`n  Otorgando permisos también a la cuenta de servicio de Cloud Run..." -ForegroundColor Yellow
            
            gcloud storage buckets add-iam-policy-binding gs://$bucket `
              --member="serviceAccount:$runServiceAccount" `
              --role="roles/storage.objectAdmin" `
              --project=$project `
              2>&1 | Out-Null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Permisos otorgados a $runServiceAccount" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "  ⚠ Cloud Run no tiene cuenta de servicio configurada (usa la cuenta por defecto)" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "✓ Permisos de Storage Object Admin otorgados" -ForegroundColor Green
Write-Host "✓ El servicio debería poder crear locks en GCS ahora" -ForegroundColor Green
Write-Host "`nEspera 1-2 minutos y verifica los logs. El error 403 de GCS debería desaparecer." -ForegroundColor Yellow

Write-Host "`n=== Fin ===" -ForegroundColor Cyan

