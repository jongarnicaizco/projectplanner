# Sistema Automático de Logs

## Problema
Auto no puede ver la salida de los comandos de Google Cloud y GitHub directamente debido a limitaciones del entorno de ejecución.

## Solución
He creado scripts que capturan la información y la guardan en archivos JSON que Auto puede leer.

## Uso Automático

### Opción 1: Script Python (Recomendado)
```powershell
cd "Media Fees Lead Automation\mfs-lead-generation-ai"
python obtener_estado.py
```

Este script:
- Ejecuta todos los comandos de Google Cloud y GitHub
- Guarda la salida en `auto_logs/status.json`
- Crea un resumen en `auto_logs/summary.txt`
- Auto puede leer estos archivos automáticamente

### Opción 2: Script PowerShell
```powershell
cd "Media Fees Lead Automation\mfs-lead-generation-ai"
.\auto_logs.ps1
```

## Archivos Generados

- `auto_logs/status.json` - Información completa en formato JSON
- `auto_logs/summary.txt` - Resumen legible

## Para Auto

Cuando necesites verificar el estado, simplemente ejecuta:
```powershell
python obtener_estado.py
```

Y luego Auto puede leer:
- `auto_logs/status.json` para ver toda la información
- `auto_logs/summary.txt` para un resumen rápido

