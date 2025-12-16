$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$logFile = Join-Path $scriptPath "push-debug-output.txt"

"=== DIAGNÓSTICO COMPLETO ===" | Out-File $logFile -Encoding UTF8
Get-Date | Out-File $logFile -Append -Encoding UTF8
"" | Out-File $logFile -Append -Encoding UTF8

# 1. Verificar archivo
"1. Verificando archivo test.txt..." | Out-File $logFile -Append -Encoding UTF8
if (Test-Path "test.txt") {
    "   ✓ test.txt existe" | Out-File $logFile -Append -Encoding UTF8
    Get-Content test.txt | Out-File $logFile -Append -Encoding UTF8
} else {
    "   ✗ test.txt NO existe" | Out-File $logFile -Append -Encoding UTF8
}

# 2. Estado de Git
"`n2. Estado de Git:" | Out-File $logFile -Append -Encoding UTF8
git status 2>&1 | Out-File $logFile -Append -Encoding UTF8

# 3. Remoto
"`n3. Remoto configurado:" | Out-File $logFile -Append -Encoding UTF8
git remote -v 2>&1 | Out-File $logFile -Append -Encoding UTF8

# 4. Configurar remoto con token
"`n4. Configurando remoto con token..." | Out-File $logFile -Append -Encoding UTF8
$remoteUrl = "https://jongarnicaizco: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@github.com/jongarnicaizco/mfs-lead-generation-ai.git"
git remote set-url origin $remoteUrl 2>&1 | Out-File $logFile -Append -Encoding UTF8
git remote -v 2>&1 | Out-File $logFile -Append -Encoding UTF8

# 5. Añadir archivo
"`n5. Añadiendo archivo..." | Out-File $logFile -Append -Encoding UTF8
git add test.txt 2>&1 | Out-File $logFile -Append -Encoding UTF8
"Exit code: $LASTEXITCODE" | Out-File $logFile -Append -Encoding UTF8

# 6. Estado después de add
"`n6. Estado después de add:" | Out-File $logFile -Append -Encoding UTF8
git status --short 2>&1 | Out-File $logFile -Append -Encoding UTF8

# 7. Commit
"`n7. Haciendo commit..." | Out-File $logFile -Append -Encoding UTF8
$commitOutput = git commit -m "Test: Subir archivo test.txt a GitHub - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1
$commitOutput | Out-File $logFile -Append -Encoding UTF8
"Exit code: $LASTEXITCODE" | Out-File $logFile -Append -Encoding UTF8

# 8. Último commit
"`n8. Último commit:" | Out-File $logFile -Append -Encoding UTF8
git log --oneline -1 2>&1 | Out-File $logFile -Append -Encoding UTF8

# 9. Push
"`n9. Haciendo push..." | Out-File $logFile -Append -Encoding UTF8
$pushOutput = git push origin main 2>&1
$pushOutput | Out-File $logFile -Append -Encoding UTF8
"Exit code: $LASTEXITCODE" | Out-File $logFile -Append -Encoding UTF8

# 10. Verificar después del push
"`n10. Verificando después del push..." | Out-File $logFile -Append -Encoding UTF8
git fetch origin 2>&1 | Out-File $logFile -Append -Encoding UTF8
"Commits locales sin push:" | Out-File $logFile -Append -Encoding UTF8
git log origin/main..HEAD --oneline 2>&1 | Out-File $logFile -Append -Encoding UTF8

"`n=== FIN DIAGNÓSTICO ===" | Out-File $logFile -Append -Encoding UTF8

Write-Host "Log guardado en: $logFile" -ForegroundColor Green

