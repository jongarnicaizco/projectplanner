# Comandos Corregidos para PowerShell

## Problema Identificado

Los errores tienen `severity=ERROR` pero `textPayload` está vacío. La información del error está en `jsonPayload`.

## Comandos Corregidos

### 1. Ver Errores Detallados (JSON completo)
```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND severity>=ERROR' --limit=5 --format="json" --project=check-in-sf --freshness=2h | ConvertFrom-Json | ForEach-Object { Write-Host "[$($_.timestamp)]"; Write-Host "Severity: $($_.severity)"; if ($_.textPayload) { Write-Host "Text: $($_.textPayload)" }; if ($_.jsonPayload) { Write-Host "JSON: $($_.jsonPayload | ConvertTo-Json -Depth 10)" }; Write-Host "" }
```

### 2. Ver Logs de Pub/Sub (sintaxis corregida)
```powershell
gcloud logging read "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`" AND textPayload:`"_pubsub`"" --limit=10 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=1h
```

### 3. Ver Logs de Airtable (sintaxis corregida)
```powershell
gcloud logging read "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`" AND textPayload:`"Airtable`"" --limit=20 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=1h
```

### 4. Ver Todos los Logs Recientes
```powershell
gcloud logging read "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"mfs-lead-generation-ai`"" --limit=50 --format="json" --project=check-in-sf --freshness=1h | ConvertFrom-Json | ForEach-Object { $text = $_.textPayload; if (-not $text -and $_.jsonPayload) { $text = ($_.jsonPayload | ConvertTo-Json -Compress) }; if ($text) { Write-Host "[$($_.timestamp)] $($text.Substring(0, [Math]::Min(200, $text.Length)))" } }
```

## Alternativa: Usar Python

Si los comandos de PowerShell siguen fallando, usa este script Python:

```python
import subprocess
import json

# Obtener errores
result = subprocess.run([
    "gcloud", "logging", "read",
    'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND severity>=ERROR',
    "--limit=5",
    "--format=json",
    "--project=check-in-sf",
    "--freshness=2h"
], capture_output=True, text=True)

errors = json.loads(result.stdout) if result.stdout.strip() else []
for error in errors:
    print(f"[{error.get('timestamp')}]")
    print(f"Severity: {error.get('severity')}")
    if error.get('textPayload'):
        print(f"Text: {error.get('textPayload')}")
    if error.get('jsonPayload'):
        print(f"JSON: {json.dumps(error.get('jsonPayload'), indent=2)}")
    print()
```

