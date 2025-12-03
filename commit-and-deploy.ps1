# Script simple para commit, push y deploy
$ErrorActionPreference = "Continue"

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host "=== COMMIT AND DEPLOY ===" -ForegroundColor Cyan
Write-Host ""

# Commit y push
Write-Host "1. Commit y push..." -ForegroundColor Yellow
git add -A
git commit -m "Auto-deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin main

# Deploy
Write-Host "`n2. Deploy..." -ForegroundColor Yellow
$tag = "auto-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"

gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs

Write-Host "`n=== DONE ===" -ForegroundColor Green

