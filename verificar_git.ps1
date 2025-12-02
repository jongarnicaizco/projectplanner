# Script para verificar Git y guardar salida en archivo
$ErrorActionPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
$outputFile = Join-Path $repoPath "git_output.txt"

Set-Location $repoPath

# Limpiar archivo anterior
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }

Write-Host "Ejecutando comandos Git y guardando en: $outputFile" -ForegroundColor Cyan

# Redirigir toda la salida al archivo
$commands = @(
    "=== git remote -v ===",
    "git remote -v",
    "`n=== git status ===",
    "git status",
    "`n=== git log --oneline -3 ===",
    "git log --oneline -3",
    "`n=== git ls-remote origin HEAD ===",
    "git ls-remote origin HEAD"
)

foreach ($cmd in $commands) {
    if ($cmd -match "^===") {
        # Es un separador
        $cmd | Out-File -FilePath $outputFile -Append -Encoding UTF8
    } else {
        # Es un comando
        try {
            $result = Invoke-Expression $cmd 2>&1
            $result | Out-File -FilePath $outputFile -Append -Encoding UTF8
        } catch {
            "Error: $_" | Out-File -FilePath $outputFile -Append -Encoding UTF8
        }
    }
}

Write-Host "Salida guardada. Leyendo archivo..." -ForegroundColor Green
Start-Sleep -Seconds 1

if (Test-Path $outputFile) {
    $content = Get-Content $outputFile -Raw
    Write-Host $content
    Write-Host "`nArchivo guardado en: $outputFile" -ForegroundColor Yellow
} else {
    Write-Host "Error: No se pudo crear el archivo de salida" -ForegroundColor Red
}

