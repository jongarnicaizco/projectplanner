# Script para conectarse al servicio Google Cloud Run: mfs-lead-generation-ai
# Proyecto: check-in-sf
# Región: us-central1

$serviceName = "mfs-lead-generation-ai"
$region = "us-central1"
$project = "check-in-sf"

Write-Host "`n=== Conectándose al servicio Cloud Run: $serviceName ===" -ForegroundColor Cyan
Write-Host "Proyecto: $project" -ForegroundColor Gray
Write-Host "Región: $region`n" -ForegroundColor Gray

# 1. Obtener información del servicio
Write-Host "1. Información del servicio:" -ForegroundColor Green
$service = gcloud run services describe $serviceName --region=$region --project=$project --format=json 2>&1 | ConvertFrom-Json

if ($service) {
    Write-Host "   URL: $($service.status.url)" -ForegroundColor White
    Write-Host "   Última revisión: $($service.status.latestReadyRevisionName)" -ForegroundColor White
    Write-Host "   Estado: $($service.status.conditions[0].status)" -ForegroundColor White
    Write-Host "   Instancias: $($service.status.observedGeneration)" -ForegroundColor White
}

# 2. Opciones de conexión
Write-Host "`n2. Opciones de conexión:" -ForegroundColor Green
Write-Host "   a) Ver logs en tiempo real" -ForegroundColor Yellow
Write-Host "   b) Ver logs recientes (últimas 50 líneas)" -ForegroundColor Yellow
Write-Host "   c) Abrir URL del servicio en el navegador" -ForegroundColor Yellow
Write-Host "   d) Ver detalles completos del servicio" -ForegroundColor Yellow
Write-Host "   e) Ver revisiones del servicio" -ForegroundColor Yellow

$opcion = Read-Host "`nSelecciona una opción (a/b/c/d/e) o presiona Enter para ver logs en tiempo real"

switch ($opcion.ToLower()) {
    "a" {
        Write-Host "`n=== Ver logs en tiempo real ===" -ForegroundColor Cyan
        Write-Host "Presiona Ctrl+C para salir`n" -ForegroundColor Gray
        gcloud logging tail "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$serviceName`"" --project=$project --format="table(timestamp,textPayload)"
    }
    "b" {
        Write-Host "`n=== Últimas 50 líneas de logs ===" -ForegroundColor Cyan
        gcloud logging read "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$serviceName`"" --limit=50 --project=$project --format="table(timestamp,textPayload)" --freshness=1h
    }
    "c" {
        if ($service) {
            Write-Host "`n=== Abriendo URL del servicio ===" -ForegroundColor Cyan
            Start-Process $service.status.url
        }
    }
    "d" {
        Write-Host "`n=== Detalles completos del servicio ===" -ForegroundColor Cyan
        gcloud run services describe $serviceName --region=$region --project=$project --format=yaml
    }
    "e" {
        Write-Host "`n=== Revisiones del servicio ===" -ForegroundColor Cyan
        gcloud run revisions list --service=$serviceName --region=$region --project=$project --limit=10 --format="table(name,status,created,traffic)"
    }
    default {
        Write-Host "`n=== Ver logs en tiempo real (por defecto) ===" -ForegroundColor Cyan
        Write-Host "Presiona Ctrl+C para salir`n" -ForegroundColor Gray
        gcloud logging tail "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$serviceName`"" --project=$project --format="table(timestamp,textPayload)"
    }
}

Write-Host "`n=== Conexión completada ===" -ForegroundColor Green

