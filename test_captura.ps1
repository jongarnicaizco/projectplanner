# Test para entender el problema de captura de salida
$ErrorActionPreference = "Continue"

# Probar diferentes métodos de captura
Write-Host "=== Test de captura de salida ===" -ForegroundColor Cyan

# Método 1: Salida directa
Write-Host "`nMétodo 1: Salida directa" -ForegroundColor Yellow
$result1 = git --version
Write-Host "Resultado: $result1"

# Método 2: Captura con variable
Write-Host "`nMétodo 2: Captura con variable" -ForegroundColor Yellow
$result2 = git --version 2>&1
Write-Host "Resultado: $result2"
Write-Host "Tipo: $($result2.GetType().Name)"

# Método 3: Invoke-Expression
Write-Host "`nMétodo 3: Invoke-Expression" -ForegroundColor Yellow
$result3 = Invoke-Expression "git --version" 2>&1
Write-Host "Resultado: $result3"

# Método 4: Subprocess
Write-Host "`nMétodo 4: Start-Process" -ForegroundColor Yellow
$result4 = Start-Process -FilePath "git" -ArgumentList "--version" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "test_output.txt" -RedirectStandardError "test_error.txt"
Write-Host "Exit code: $($result4.ExitCode)"
if (Test-Path "test_output.txt") {
    Write-Host "Contenido:"
    Get-Content "test_output.txt"
}

# Método 5: StreamReader
Write-Host "`nMétodo 5: StreamReader" -ForegroundColor Yellow
$process = New-Object System.Diagnostics.Process
$process.StartInfo.FileName = "git"
$process.StartInfo.Arguments = "--version"
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true
$process.Start() | Out-Null
$output = $process.StandardOutput.ReadToEnd()
$error = $process.StandardError.ReadToEnd()
$process.WaitForExit()
Write-Host "Output: $output"
Write-Host "Error: $error"
Write-Host "Exit code: $($process.ExitCode)"

# Método 6: Guardar en archivo y leer
Write-Host "`nMétodo 6: Guardar en archivo" -ForegroundColor Yellow
git --version > test_file.txt 2>&1
if (Test-Path "test_file.txt") {
    Write-Host "Archivo creado, contenido:"
    Get-Content "test_file.txt"
} else {
    Write-Host "Archivo NO creado"
}

