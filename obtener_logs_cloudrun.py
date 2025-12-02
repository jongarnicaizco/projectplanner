#!/usr/bin/env python3
"""
Script para obtener logs de Cloud Run y diagnosticar por qué no se procesan emails
"""
import subprocess
import json
import os
from datetime import datetime, timedelta

repo_path = r"C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
os.chdir(repo_path)

def run_command(cmd, description):
    """Ejecuta un comando y retorna el resultado"""
    print(f"  → {description}...")
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=repo_path
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout.strip(),
            "error": result.stderr.strip(),
            "exitCode": result.returncode
        }
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "exitCode": -1
        }

print("\n=== Obteniendo logs de Cloud Run ===")
print("Buscando logs relacionados con procesamiento de emails...\n")

# Obtener logs recientes (últimas 2 horas)
timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
results = {
    "timestamp": timestamp,
    "logs": []
}

# 1. Logs de Cloud Run (últimas 100 líneas)
print("[1] Obteniendo logs recientes de Cloud Run...")
logs_cmd = 'gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai" --project=check-in-sf --limit=100 --format=json --freshness=2h'
result = run_command(logs_cmd, "Logs de Cloud Run")
results["logs"].append({
    "type": "cloud_run_recent",
    "description": "Logs recientes de Cloud Run (últimas 2 horas)",
    "result": result
})

# 2. Logs específicos de procesamiento de emails
print("\n[2] Buscando logs de procesamiento de emails...")
email_logs_cmd = 'gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai AND (textPayload=~\"mfs.*procesar\" OR textPayload=~\"mfs.*email\" OR textPayload=~\"mfs.*pubsub\" OR textPayload=~\"mfs.*_pubsub\")" --project=check-in-sf --limit=50 --format=json --freshness=2h'
result = run_command(email_logs_cmd, "Logs de procesamiento de emails")
results["logs"].append({
    "type": "email_processing",
    "description": "Logs específicos de procesamiento de emails",
    "result": result
})

# 3. Logs de errores
print("\n[3] Buscando errores...")
error_logs_cmd = 'gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai AND severity>=ERROR" --project=check-in-sf --limit=30 --format=json --freshness=2h'
result = run_command(error_logs_cmd, "Logs de errores")
results["logs"].append({
    "type": "errors",
    "description": "Errores recientes",
    "result": result
})

# 4. Estado del servicio
print("\n[4] Verificando estado del servicio...")
service_cmd = 'gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format=json'
result = run_command(service_cmd, "Estado del servicio")
results["service_status"] = result

# 5. Verificar Pub/Sub
print("\n[5] Verificando configuración de Pub/Sub...")
pubsub_cmd = 'gcloud pubsub subscriptions list --project=check-in-sf --format=json'
result = run_command(pubsub_cmd, "Suscripciones de Pub/Sub")
results["pubsub"] = result

# Guardar en archivo JSON
output_file = os.path.join(repo_path, "cloud_run_logs_diagnostico.json")
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n✓ Logs guardados en: {output_file}")

# Crear resumen legible
summary_file = os.path.join(repo_path, "cloud_run_logs_resumen.txt")
with open(summary_file, 'w', encoding='utf-8') as f:
    f.write("=== DIAGNÓSTICO: POR QUÉ NO SE PROCESAN EMAILS ===\n")
    f.write(f"Generado: {timestamp}\n\n")
    
    for log_entry in results["logs"]:
        f.write(f"\n{'='*80}\n")
        f.write(f"{log_entry['description']}\n")
        f.write(f"{'='*80}\n")
        if log_entry["result"]["success"]:
            if log_entry["result"]["output"]:
                # Intentar parsear JSON si es posible
                try:
                    logs = json.loads(log_entry["result"]["output"])
                    f.write(f"Total de logs encontrados: {len(logs)}\n\n")
                    # Mostrar los primeros 5 logs
                    for i, log in enumerate(logs[:5], 1):
                        f.write(f"\n--- Log {i} ---\n")
                        if "textPayload" in log:
                            f.write(f"Texto: {log['textPayload']}\n")
                        if "jsonPayload" in log:
                            f.write(f"JSON: {json.dumps(log['jsonPayload'], indent=2)}\n")
                        if "timestamp" in log:
                            f.write(f"Timestamp: {log['timestamp']}\n")
                        if "severity" in log:
                            f.write(f"Severidad: {log['severity']}\n")
                except:
                    f.write(log_entry["result"]["output"][:2000] + "\n")
            else:
                f.write("No hay logs en este período\n")
        else:
            f.write(f"Error: {log_entry['result']['error']}\n")
    
    f.write(f"\n\n{'='*80}\n")
    f.write("ESTADO DEL SERVICIO\n")
    f.write(f"{'='*80}\n")
    if results["service_status"]["success"]:
        f.write("Servicio accesible\n")
        if results["service_status"]["output"]:
            try:
                service_info = json.loads(results["service_status"]["output"])
                f.write(f"Estado: {service_info.get('status', {}).get('conditions', [{}])[0].get('status', 'Unknown')}\n")
                f.write(f"Última revisión: {service_info.get('status', {}).get('latestReadyRevisionName', 'Unknown')}\n")
            except:
                f.write(results["service_status"]["output"][:500] + "\n")
    else:
        f.write(f"Error obteniendo estado: {results['service_status']['error']}\n")

print(f"✓ Resumen guardado en: {summary_file}")

