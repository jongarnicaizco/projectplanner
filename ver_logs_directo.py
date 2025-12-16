#!/usr/bin/env python3
"""Ver logs de Cloud Run directamente usando la API de Google Cloud"""
import subprocess
import json
import sys

def run_gcloud_logs():
    """Obtener logs directamente de Cloud Run"""
    cmd = [
        "gcloud", "logging", "read",
        "resource.type=cloud_run_revision AND resource.labels.service_name=mfs-lead-generation-ai",
        "--project=check-in-sf",
        "--limit=30",
        "--format=json",
        "--freshness=1h"
    ]
    
    print("Ejecutando comando de gcloud...")
    print(" ".join(cmd))
    print("\n" + "="*80)
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        print(f"Exit code: {result.returncode}")
        print(f"STDOUT length: {len(result.stdout)}")
        print(f"STDERR length: {len(result.stderr)}")
        
        if result.stdout:
            print("\n=== STDOUT ===")
            try:
                logs = json.loads(result.stdout)
                print(f"Total logs: {len(logs)}\n")
                for i, log in enumerate(logs[:10], 1):
                    timestamp = log.get("timestamp", "N/A")
                    severity = log.get("severity", "INFO")
                    text = log.get("textPayload", log.get("jsonPayload", {}))
                    if isinstance(text, dict):
                        text = json.dumps(text, indent=2)
                    print(f"\n[{i}] {timestamp} [{severity}]")
                    print(f"    {str(text)[:300]}")
            except json.JSONDecodeError:
                print(result.stdout[:2000])
        else:
            print("No hay salida en STDOUT")
        
        if result.stderr:
            print("\n=== STDERR ===")
            print(result.stderr)
            
    except subprocess.TimeoutExpired:
        print("ERROR: Comando expiró (timeout)")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    run_gcloud_logs()

