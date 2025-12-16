#!/usr/bin/env python3
"""Script para verificar Google Cloud y capturar salida"""
import subprocess
import sys
import os
from datetime import datetime

repo_path = r"C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
output_file = os.path.join(repo_path, "gcloud_output.txt")

os.chdir(repo_path)

commands = [
    ("gcloud config get-value project", "Proyecto actual de Google Cloud"),
    ("gcloud builds list --project=check-in-sf --limit=5 --format=json", "Builds recientes (JSON)"),
    ("gcloud builds triggers list --project=check-in-sf --format=json", "Triggers de Cloud Build (JSON)"),
    ("gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format=json", "Servicio Cloud Run (JSON)"),
    ("gcloud run revisions list --service=mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --limit=3 --format=json", "Revisiones recientes (JSON)"),
    ("gcloud builds list --project=check-in-sf --ongoing --format=json", "Builds en progreso (JSON)"),
]

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"=== Verificación de Google Cloud ===\n")
    f.write(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"{'='*80}\n\n")
    
    for cmd, description in commands:
        f.write(f"\n{'='*80}\n")
        f.write(f"=== {description} ===\n")
        f.write(f"Comando: {cmd}\n")
        f.write(f"{'='*80}\n")
        
        try:
            result = subprocess.run(
                cmd.split(),
                capture_output=True,
                text=True,
                timeout=60,
                cwd=repo_path
            )
            
            if result.stdout:
                f.write("STDOUT:\n")
                f.write(result.stdout)
                f.write("\n")
            
            if result.stderr:
                f.write("STDERR:\n")
                f.write(result.stderr)
                f.write("\n")
            
            f.write(f"Exit code: {result.returncode}\n")
            
        except subprocess.TimeoutExpired:
            f.write("ERROR: Comando expiró (timeout)\n")
        except Exception as e:
            f.write(f"ERROR: {str(e)}\n")

print(f"Salida guardada en: {output_file}")

# Leer y mostrar el archivo
if os.path.exists(output_file):
    with open(output_file, 'r', encoding='utf-8') as f:
        content = f.read()
        print("\n" + "="*80)
        print("CONTENIDO DEL ARCHIVO:")
        print("="*80)
        print(content)
else:
    print("ERROR: No se pudo crear el archivo")

