# EJECUTA ESTE SCRIPT PARA DESPLEGAR EL EMAIL DE PRUEBA
# Copia y pega este contenido en PowerShell

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host "=== CONFIGURANDO GIT ===" -ForegroundColor Cyan
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git

Write-Host "`n=== AÑADIENDO CAMBIOS ===" -ForegroundColor Cyan
git add services/email-sender.js services/processor.js

Write-Host "`n=== HACIENDO COMMIT ===" -ForegroundColor Cyan
git commit -m "Deploy: Email de prueba antes de Airtable"

Write-Host "`n=== HACIENDO PUSH ===" -ForegroundColor Cyan
git push origin main

Write-Host "`n=== DESPLEGANDO ===" -ForegroundColor Cyan
$tag = "email-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"
Write-Host "Tag: $tag" -ForegroundColor Gray

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs

Write-Host "`n=== COMPLETADO ===" -ForegroundColor Green

