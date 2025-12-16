# COPIA Y PEGA ESTE CÓDIGO COMPLETO EN POWERSHELL
# Esto hará push a GitHub de forma confiable

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Write-Host "=== CONFIGURANDO GIT ===" -ForegroundColor Cyan
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git
Write-Host "Remoto configurado" -ForegroundColor Green

Write-Host "`n=== VERIFICANDO ARCHIVOS ===" -ForegroundColor Cyan
if (Test-Path "services\email-sender.js") { Write-Host "✓ email-sender.js existe" -ForegroundColor Green } else { Write-Host "✗ email-sender.js NO existe" -ForegroundColor Red }
if (Test-Path ".github\workflows\deploy.yml") { Write-Host "✓ deploy.yml existe" -ForegroundColor Green } else { Write-Host "✗ deploy.yml NO existe" -ForegroundColor Red }

Write-Host "`n=== AÑADIENDO CAMBIOS ===" -ForegroundColor Cyan
git add -A
git status --short

Write-Host "`n=== HACIENDO COMMIT ===" -ForegroundColor Cyan
git commit -m "Add: Email de prueba antes de Airtable + GitHub Actions workflow"
git log --oneline -1

Write-Host "`n=== HACIENDO PUSH ===" -ForegroundColor Cyan
git push origin main

Write-Host "`n=== VERIFICANDO CONEXIÓN ===" -ForegroundColor Cyan
git ls-remote origin HEAD

Write-Host "`n=== COMPLETADO ===" -ForegroundColor Green
Write-Host "Verifica en: https://github.com/jongarnicaizco/mfs-lead-generation-ai" -ForegroundColor Cyan

