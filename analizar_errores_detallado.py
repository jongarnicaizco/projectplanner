#!/usr/bin/env python3
"""Script para analizar errores detallados de Cloud Run"""
import subprocess
import json
import sys
from datetime import datetime

project = "check-in-sf"
service = "mfs-lead-generation-ai"

print("=" * 70)
print("ANÁLISIS DETALLADO DE ERRORES")
print("=" * 70)
print()

# 1. Obtener errores recientes
print("[1] Obteniendo errores recientes...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}" AND severity>=ERROR',
    "--limit=5",
    "--format=json",
    f"--project={project}",
    "--freshness=2h"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        errors = json.loads(result.stdout)
        if errors:
            print(f"  ✓ Se encontraron {len(errors)} errores:\n")
            for i, error in enumerate(errors, 1):
                timestamp = error.get("timestamp", "N/A")
                severity = error.get("severity", "N/A")
                text = error.get("textPayload", "")
                json_payload = error.get("jsonPayload", {})
                
                print(f"  ERROR #{i}")
                print(f"  Timestamp: {timestamp}")
                print(f"  Severity: {severity}")
                
                if text:
                    print(f"  Text Payload: {text[:300]}")
                elif json_payload:
                    print(f"  JSON Payload:")
                    print(json.dumps(json_payload, indent=4)[:500])
                else:
                    print("  (Sin payload visible)")
                print()
        else:
            print("  ✓ No se encontraron errores recientes\n")
    else:
        print(f"  ⚠️ No se encontraron errores o hubo un problema\n")
        if result.stderr:
            print(f"  Stderr: {result.stderr}\n")
except Exception as e:
    print(f"  ✗ Error al obtener errores: {e}\n")

# 2. Obtener todos los logs recientes y buscar errores
print("[2] Analizando todos los logs recientes...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}"',
    "--limit=100",
    "--format=json",
    f"--project={project}",
    "--freshness=1h"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        logs = json.loads(result.stdout)
        if logs:
            print(f"  Total de logs: {len(logs)}")
            
            # Filtrar errores
            errors = []
            for log in logs:
                severity = log.get("severity", "")
                text = str(log.get("textPayload", ""))
                json_payload = log.get("jsonPayload", {})
                
                if severity in ["ERROR", "CRITICAL"]:
                    errors.append(log)
                elif "error" in text.lower() or "Error" in text:
                    errors.append(log)
                elif json_payload and ("error" in str(json_payload).lower() or "Error" in str(json_payload)):
                    errors.append(log)
            
            print(f"  Errores encontrados: {len(errors)}\n")
            
            if errors:
                print("  Últimos errores:")
                for i, error in enumerate(errors[:10], 1):
                    timestamp = error.get("timestamp", "N/A")
                    text = str(error.get("textPayload", ""))
                    json_payload = error.get("jsonPayload", {})
                    
                    message = text
                    if not message and json_payload:
                        message = json.dumps(json_payload)
                    
                    print(f"  [{i}] [{timestamp}]")
                    if message:
                        print(f"      {message[:250]}")
                    print()
        else:
            print("  ⚠️ No se encontraron logs\n")
    else:
        print("  ⚠️ No se encontraron logs o hubo un problema\n")
        if result.stderr:
            print(f"  Stderr: {result.stderr}\n")
except Exception as e:
    print(f"  ✗ Error al obtener logs: {e}\n")

# 3. Buscar logs específicos de Pub/Sub
print("[3] Buscando logs de Pub/Sub...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}"',
    "--limit=50",
    "--format=json",
    f"--project={project}",
    "--freshness=1h"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        logs = json.loads(result.stdout)
        pubsub_logs = [l for l in logs if "_pubsub" in str(l.get("textPayload", "")).lower() or "_pubsub" in str(l.get("jsonPayload", {})).lower()]
        
        if pubsub_logs:
            print(f"  ✓ Se encontraron {len(pubsub_logs)} logs de Pub/Sub:\n")
            for log in pubsub_logs[:5]:
                timestamp = log.get("timestamp", "N/A")
                text = str(log.get("textPayload", ""))
                if not text:
                    text = str(log.get("jsonPayload", {}))
                print(f"  [{timestamp}] {text[:150]}")
            print()
        else:
            print("  ⚠️ No se encontraron logs de Pub/Sub\n")
except Exception as e:
    print(f"  ✗ Error: {e}\n")

# 4. Buscar logs de Airtable
print("[4] Buscando logs de Airtable...")
try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        logs = json.loads(result.stdout)
        airtable_logs = [l for l in logs if "airtable" in str(l.get("textPayload", "")).lower() or "airtable" in str(l.get("jsonPayload", {})).lower()]
        
        if airtable_logs:
            print(f"  ✓ Se encontraron {len(airtable_logs)} logs de Airtable:\n")
            success = [l for l in airtable_logs if "creado" in str(l.get("textPayload", "")).lower() or "exitoso" in str(l.get("textPayload", "")).lower()]
            failed = [l for l in airtable_logs if "error" in str(l.get("textPayload", "")).lower() or "fallo" in str(l.get("textPayload", "")).lower()]
            
            print(f"    Exitosos: {len(success)}")
            print(f"    Fallidos: {len(failed)}\n")
            
            if failed:
                print("  Errores de Airtable:")
                for log in failed[:5]:
                    timestamp = log.get("timestamp", "N/A")
                    text = str(log.get("textPayload", ""))
                    print(f"    [{timestamp}] {text[:200]}")
                print()
        else:
            print("  ⚠️ No se encontraron logs de Airtable\n")
except Exception as e:
    print(f"  ✗ Error: {e}\n")

print("=" * 70)
print("ANÁLISIS COMPLETADO")
print("=" * 70)

