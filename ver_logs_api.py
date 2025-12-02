#!/usr/bin/env python3
"""Ver logs usando la API de Google Cloud directamente"""
import os
import sys

# Intentar importar la biblioteca de Google Cloud
try:
    from google.cloud import logging as cloud_logging
    print("✓ Biblioteca google-cloud-logging disponible")
except ImportError:
    print("✗ Biblioteca google-cloud-logging no disponible")
    print("Instalando...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "google-cloud-logging", "-q"])
    from google.cloud import logging as cloud_logging
    print("✓ Biblioteca instalada")

def get_logs():
    """Obtener logs de Cloud Run"""
    project_id = "check-in-sf"
    service_name = "mfs-lead-generation-ai"
    
    print(f"\nConectando a Google Cloud Logging...")
    print(f"Proyecto: {project_id}")
    print(f"Servicio: {service_name}\n")
    
    try:
        client = cloud_logging.Client(project=project_id)
        
        # Filtrar logs
        filter_str = f"""
        resource.type=cloud_run_revision
        AND resource.labels.service_name={service_name}
        """
        
        print(f"Filtro: {filter_str.strip()}\n")
        print("Obteniendo logs...\n")
        print("="*80)
        
        entries = client.list_entries(
            filter_=filter_str,
            max_results=30,
            order_by=cloud_logging.DESCENDING
        )
        
        count = 0
        for entry in entries:
            count += 1
            timestamp = entry.timestamp.strftime("%Y-%m-%d %H:%M:%S") if entry.timestamp else "N/A"
            severity = entry.severity or "INFO"
            payload = entry.payload
            
            if isinstance(payload, dict):
                payload_str = json.dumps(payload, indent=2)
            else:
                payload_str = str(payload)
            
            print(f"\n[{count}] {timestamp} [{severity}]")
            print(f"{payload_str[:400]}")
            print("-"*80)
            
            if count >= 30:
                break
        
        if count == 0:
            print("No se encontraron logs")
        else:
            print(f"\n✓ Total de logs mostrados: {count}")
            
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import json
    get_logs()

