# Script para capturar salida de comandos git
$ErrorActionPreference = "Continue"
$InformationPreference = "Continue"

$repoPath = "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
Set-Location $repoPath

# Configurar encoding UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "`n=== Capturando salida de comandos Git ===" -ForegroundColor Cyan

$commands = @(
    @{cmd="git remote -v"; desc="Remoto configurado"},
    @{cmd="git status"; desc="Estado del repositorio"},
    @{cmd="git log --oneline -3"; desc="Últimos 3 commits"},
    @{cmd="git ls-remote origin HEAD"; desc="Verificar conexión con GitHub"}
)

foreach ($item in $commands) {
    Write-Host "`n$('='*60)" -ForegroundColor Yellow
    Write-Host "$($item.desc): $($item.cmd)" -ForegroundColor Cyan
    Write-Host $('='*60) -ForegroundColor Yellow
    
    try {
        # Intentar múltiples métodos de captura
        $output1 = & cmd /c "$($item.cmd) 2>&1"
        Write-Host "Método 1 (cmd):" -ForegroundColor Gray
        Write-Host $output1
        
        $output2 = Invoke-Expression $item.cmd 2>&1 | Out-String
        Write-Host "`nMétodo 2 (Invoke-Expression):" -ForegroundColor Gray
        Write-Host $output2
        
        $output3 = (cmd /c "$($item.cmd) 2>&1") | Out-String
        Write-Host "`nMétodo 3 (cmd con pipe):" -ForegroundColor Gray
        Write-Host $output3
        
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

Write-Host "`n=== Fin de captura ===" -ForegroundColor Cyan

