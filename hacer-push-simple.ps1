# Script simple para hacer push
$ErrorActionPreference = "Continue"
Set-Location "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

# Configurar remoto con token
git remote set-url origin https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git

# Añadir, commit y push
Write-Output "Añadiendo archivo..."
git add test.txt
Write-Output "Exit code add: $LASTEXITCODE"

Write-Output "Haciendo commit..."
git commit -m "Test: Subir archivo test.txt a GitHub"
Write-Output "Exit code commit: $LASTEXITCODE"

Write-Output "Haciendo push..."
git push origin main
Write-Output "Exit code push: $LASTEXITCODE"

Write-Output "Verificando..."
git fetch origin
git log origin/main..HEAD --oneline

