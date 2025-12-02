# Script para verificar GitHub y guardar salida
$ErrorActionPreference = "Continue"

$outputFile = "github_output.txt"
$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

Set-Location $repoPath

# Limpiar archivo anterior
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }

Write-Host "Ejecutando comandos de Git/GitHub..." -ForegroundColor Cyan

# Función para ejecutar comando y guardar salida
function Execute-Command {
    param($cmd, $description)
    
    "`n$('='*80)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    "=== $description ===" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    "Comando: $cmd" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    "$('='*80)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    
    try {
        $result = Invoke-Expression $cmd 2>&1 | Out-String
        $result | Out-File -FilePath $outputFile -Append -Encoding UTF8
        "Exit code: $LASTEXITCODE" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    } catch {
        "Error: $_" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    }
}

# Verificar remoto
Execute-Command "git remote -v" "Configuración del remoto"

# Estado del repositorio
Execute-Command "git status" "Estado del repositorio"

# Últimos commits
Execute-Command "git log --oneline -5" "Últimos 5 commits"

# Verificar conexión con GitHub
Execute-Command "git ls-remote origin HEAD" "Conexión con GitHub (HEAD)"

# Verificar rama actual vs remota
Execute-Command "git log --oneline origin/main..HEAD" "Commits locales no pusheados"
Execute-Command "git log --oneline HEAD..origin/main" "Commits remotos no descargados"

# Verificar última actualización
Execute-Command "git fetch origin --dry-run" "Verificar si hay cambios remotos"

Write-Host "Salida guardada en: $outputFile" -ForegroundColor Green
Start-Sleep -Seconds 2

if (Test-Path $outputFile) {
    Write-Host "`nContenido del archivo:" -ForegroundColor Yellow
    Get-Content $outputFile
} else {
    Write-Host "Error: No se pudo crear el archivo" -ForegroundColor Red
}

