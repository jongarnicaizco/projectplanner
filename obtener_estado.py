#!/usr/bin/env python3
"""
Script Python para obtener estado de Google Cloud y GitHub
Este script puede ejecutarse automáticamente y guarda la salida en archivos JSON
"""
import subprocess
import json
import os
from datetime import datetime

repo_path = r"C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
logs_dir = os.path.join(repo_path, "auto_logs")

# Asegurar que el directorio existe
try:
    os.makedirs(logs_dir, exist_ok=True)
except Exception as e:
    print(f"Error creando directorio: {e}")
    # Fallback: usar directorio raíz
    logs_dir = repo_path

# Crear directorio si no existe
os.makedirs(logs_dir, exist_ok=True)
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
            timeout=60,
            cwd=repo_path
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout.strip(),
            "error": result.stderr.strip(),
            "exitCode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "output": "",
            "error": "Timeout expired",
            "exitCode": -1
        }
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "exitCode": -1
        }

print("\n=== Generando logs automáticos ===")
print(f"Directorio de logs: {logs_dir}")

timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
results = {
    "timestamp": timestamp,
    "gcloud": {},
    "github": {}
}

# Google Cloud
print("\n[Google Cloud]")
results["gcloud"]["project"] = run_command("gcloud config get-value project", "Proyecto actual")
results["gcloud"]["builds"] = run_command("gcloud builds list --project=check-in-sf --limit=5 --format=json", "Builds recientes")
results["gcloud"]["ongoing"] = run_command("gcloud builds list --project=check-in-sf --ongoing --format=json", "Builds en progreso")
results["gcloud"]["triggers"] = run_command("gcloud builds triggers list --project=check-in-sf --format=json", "Triggers")
results["gcloud"]["service"] = run_command("gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format=json", "Servicio Cloud Run")
results["gcloud"]["revisions"] = run_command("gcloud run revisions list --service=mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --limit=3 --format=json", "Revisiones")

# GitHub
print("\n[GitHub]")
results["github"]["remote"] = run_command("git remote -v", "Remoto configurado")
results["github"]["status"] = run_command("git status", "Estado del repositorio")
results["github"]["log"] = run_command("git log --oneline -5", "Últimos 5 commits")
results["github"]["connection"] = run_command("git ls-remote origin HEAD", "Conexión con GitHub")

# Guardar en archivo JSON
output_file = os.path.join(logs_dir, "status.json")
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n✓ Logs guardados en: {output_file}")

# Guardar resumen
summary_file = os.path.join(logs_dir, "summary.txt")
with open(summary_file, 'w', encoding='utf-8') as f:
    f.write(f"=== RESUMEN DE ESTADO ===\n")
    f.write(f"Generado: {timestamp}\n\n")
    f.write("GOOGLE CLOUD:\n")
    f.write(f"- Proyecto: {results['gcloud']['project']['output'] if results['gcloud']['project']['success'] else 'Error'}\n")
    f.write(f"- Builds: {'OK' if results['gcloud']['builds']['success'] else 'Error'}\n")
    f.write(f"- En progreso: {'OK' if results['gcloud']['ongoing']['success'] else 'Error'}\n")
    f.write(f"- Triggers: {'OK' if results['gcloud']['triggers']['success'] else 'Error'}\n")
    f.write(f"- Servicio: {'OK' if results['gcloud']['service']['success'] else 'Error'}\n\n")
    f.write("GITHUB:\n")
    f.write(f"- Remoto: {'OK' if results['github']['remote']['success'] else 'Error'}\n")
    f.write(f"- Estado: {'OK' if results['github']['status']['success'] else 'Error'}\n")
    f.write(f"- Commits: {'OK' if results['github']['log']['success'] else 'Error'}\n")
    f.write(f"- Conexión: {'OK' if results['github']['connection']['success'] else 'Error'}\n")

print(f"✓ Resumen guardado en: {summary_file}")

