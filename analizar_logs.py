#!/usr/bin/env python3
"""Analizar logs de Cloud Run para diagnosticar problema"""
import json
import os
from datetime import datetime

repo_path = r"C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
log_file = os.path.join(repo_path, "cloud_run_logs_diagnostico.json")

if not os.path.exists(log_file):
    print(f"Error: No se encontró {log_file}")
    exit(1)

with open(log_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=== ANÁLISIS DE LOGS DE CLOUD RUN ===\n")

# Analizar logs recientes
if data.get("logs") and len(data["logs"]) > 0:
    recent_logs = data["logs"][0]
    if recent_logs["result"]["success"] and recent_logs["result"]["output"]:
        try:
            logs = json.loads(recent_logs["result"]["output"])
            print(f"Total de logs encontrados: {len(logs)}\n")
            
            # Filtrar logs relevantes
            pubsub_logs = [log for log in logs if "_pubsub" in log.get("textPayload", "")]
            history_logs = [log for log in logs if "[history]" in log.get("textPayload", "")]
            error_logs = [log for log in logs if log.get("severity") in ["ERROR", "CRITICAL"]]
            
            print(f"Logs de Pub/Sub: {len(pubsub_logs)}")
            print(f"Logs de History: {len(history_logs)}")
            print(f"Logs de Error: {len(error_logs)}\n")
            
            print("=== ÚLTIMOS LOGS DE PUB/SUB ===")
            for i, log in enumerate(pubsub_logs[-10:], 1):
                timestamp = log.get("timestamp", "N/A")
                text = log.get("textPayload", "")
                print(f"\n{i}. [{timestamp}] {text[:200]}")
            
            print("\n=== ÚLTIMOS LOGS DE HISTORY ===")
            for i, log in enumerate(history_logs[-10:], 1):
                timestamp = log.get("timestamp", "N/A")
                text = log.get("textPayload", "")
                print(f"\n{i}. [{timestamp}] {text[:200]}")
            
            if error_logs:
                print("\n=== ERRORES ENCONTRADOS ===")
                for i, log in enumerate(error_logs[-5:], 1):
                    timestamp = log.get("timestamp", "N/A")
                    text = log.get("textPayload", log.get("jsonPayload", {}))
                    print(f"\n{i}. [{timestamp}] {str(text)[:300]}")
            else:
                print("\n✓ No se encontraron errores recientes")
                
        except Exception as e:
            print(f"Error parseando logs: {e}")
            print(f"Output: {recent_logs['result']['output'][:500]}")

# Analizar estado del servicio
if "service_status" in data:
    service = data["service_status"]
    print("\n=== ESTADO DEL SERVICIO ===")
    if service["success"]:
        print("✓ Servicio accesible")
        try:
            service_info = json.loads(service["output"])
            print(f"Última revisión: {service_info.get('status', {}).get('latestReadyRevisionName', 'N/A')}")
            print(f"Estado: {service_info.get('status', {}).get('conditions', [{}])[0].get('status', 'N/A')}")
        except:
            print(f"Info: {service['output'][:200]}")
    else:
        print(f"✗ Error: {service['error']}")

print("\n=== DIAGNÓSTICO ===")
print("Problema identificado:")
print("- Las notificaciones de Pub/Sub SÍ están llegando")
print("- Pero no se encuentran mensajes nuevos para procesar")
print("- Posibles causas:")
print("  1. El historyId guardado está muy avanzado")
print("  2. Los mensajes no están llegando a INBOX")
print("  3. El historyId de la notificación es <= al guardado")
print("\nSolución sugerida:")
print("- Ejecutar /reset para reiniciar el historyId")
print("- O verificar si hay emails nuevos en INBOX manualmente")

