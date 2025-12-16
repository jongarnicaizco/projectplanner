#!/usr/bin/env python3
"""Script para obtener y analizar logs de errores de Cloud Run"""
import subprocess
import json
import sys
from datetime import datetime, timedelta

project = "check-in-sf"
service = "mfs-lead-generation-ai"

print("=== Diagnóstico de Errores en Cloud Run ===\n")

# 1. Obtener errores recientes
print("[1] Obteniendo errores recientes (últimas 2 horas)...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}" AND (severity="ERROR" OR severity="CRITICAL")',
    "--limit=20",
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
            for i, error in enumerate(errors[:10], 1):
                timestamp = error.get("timestamp", "N/A")
                text = error.get("textPayload", "")
                if not text and error.get("jsonPayload"):
                    text = json.dumps(error["jsonPayload"])
                print(f"  [{i}] [{timestamp}]")
                print(f"      {text[:300]}")
                print()
        else:
            print("  ✓ No se encontraron errores recientes\n")
    else:
        print("  ⚠️ No se encontraron errores o hubo un problema al obtenerlos\n")
except Exception as e:
    print(f"  ✗ Error al obtener errores: {e}\n")

# 2. Obtener logs de Pub/Sub
print("[2] Obteniendo logs de Pub/Sub (última hora)...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}" AND textPayload=~"_pubsub"',
    "--limit=10",
    "--format=json",
    f"--project={project}",
    "--freshness=1h"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        logs = json.loads(result.stdout)
        if logs:
            print(f"  ✓ Se encontraron {len(logs)} logs de Pub/Sub:\n")
            for log in logs[:5]:
                timestamp = log.get("timestamp", "N/A")
                text = log.get("textPayload", "")
                if not text and log.get("jsonPayload"):
                    text = json.dumps(log["jsonPayload"])
                print(f"  [{timestamp}] {text[:150]}")
            print()
        else:
            print("  ⚠️ No se encontraron logs de Pub/Sub\n")
    else:
        print("  ⚠️ No se encontraron logs de Pub/Sub\n")
except Exception as e:
    print(f"  ✗ Error al obtener logs de Pub/Sub: {e}\n")

# 3. Obtener logs de Airtable
print("[3] Obteniendo logs de Airtable (última hora)...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}" AND textPayload=~"Airtable"',
    "--limit=20",
    "--format=json",
    f"--project={project}",
    "--freshness=1h"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        logs = json.loads(result.stdout)
        if logs:
            success = [l for l in logs if "creado" in l.get("textPayload", "").lower() or "exitoso" in l.get("textPayload", "").lower()]
            failed = [l for l in logs if "error" in l.get("textPayload", "").lower() or "fallo" in l.get("textPayload", "").lower()]
            print(f"  Logs encontrados: {len(logs)}")
            print(f"    Exitosos: {len(success)}")
            print(f"    Fallidos: {len(failed)}\n")
            if failed:
                print("  Errores de Airtable:")
                for log in failed[:5]:
                    timestamp = log.get("timestamp", "N/A")
                    text = log.get("textPayload", "")
                    print(f"    [{timestamp}] {text[:200]}")
                print()
        else:
            print("  ⚠️ No se encontraron logs de Airtable\n")
    else:
        print("  ⚠️ No se encontraron logs de Airtable\n")
except Exception as e:
    print(f"  ✗ Error al obtener logs de Airtable: {e}\n")

# 4. Obtener logs de procesamiento
print("[4] Obteniendo logs de procesamiento (última hora)...")
cmd = [
    "gcloud", "logging", "read",
    f'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}" AND (textPayload=~"procesando mensaje" OR textPayload=~"IDs que voy a procesar" OR textPayload=~"Delta INBOX")',
    "--limit=10",
    "--format=json",
    f"--project={project}",
    "--freshness=1h"
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        logs = json.loads(result.stdout)
        if logs:
            print(f"  ✓ Se encontraron {len(logs)} logs de procesamiento:\n")
            for log in logs[:5]:
                timestamp = log.get("timestamp", "N/A")
                text = log.get("textPayload", "")
                if not text and log.get("jsonPayload"):
                    text = json.dumps(log["jsonPayload"])
                print(f"  [{timestamp}] {text[:150]}")
            print()
        else:
            print("  ⚠️ No se encontraron logs de procesamiento\n")
    else:
        print("  ⚠️ No se encontraron logs de procesamiento\n")
except Exception as e:
    print(f"  ✗ Error al obtener logs de procesamiento: {e}\n")

# 5. Obtener todos los logs recientes para análisis general
print("[5] Análisis general de logs (última hora)...")
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
            errors = [l for l in logs if l.get("severity") in ["ERROR", "CRITICAL"] or "error" in l.get("textPayload", "").lower()]
            warnings = [l for l in logs if l.get("severity") == "WARNING"]
            print(f"  Errores: {len(errors)}")
            print(f"  Advertencias: {len(warnings)}\n")
            
            if errors:
                print("  Últimos errores encontrados:")
                for error in errors[:5]:
                    timestamp = error.get("timestamp", "N/A")
                    text = error.get("textPayload", "")
                    if not text and error.get("jsonPayload"):
                        text = json.dumps(error["jsonPayload"])
                    print(f"    [{timestamp}] {text[:200]}")
                print()
        else:
            print("  ⚠️ No se encontraron logs recientes\n")
    else:
        print("  ⚠️ No se encontraron logs o hubo un problema\n")
except Exception as e:
    print(f"  ✗ Error al obtener logs: {e}\n")

print("=== Diagnóstico completado ===")

