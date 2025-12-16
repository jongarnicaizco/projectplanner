#!/usr/bin/env python3
"""
Script para verificar si los emails se están enviando correctamente
"""
import subprocess
import json
from datetime import datetime, timedelta

def obtener_logs_recientes():
    """Obtiene los logs más recientes del servicio"""
    print("=" * 70)
    print("  VERIFICACIÓN DE ENVÍO DE EMAILS")
    print("=" * 70)
    print()
    
    # Obtener logs de las últimas 10 minutos
    cmd = [
        "gcloud", "logging", "read",
        f'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai"',
        "--limit=100",
        "--format=json",
        "--project=check-in-sf"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        logs = json.loads(result.stdout)
        
        # Filtrar logs relacionados con emails
        email_logs = []
        error_logs = []
        
        for log in logs:
            text = log.get('textPayload', '') or log.get('jsonPayload', {}).get('message', '')
            
            if 'email' in text.lower() or 'sendLeadEmail' in text or 'EMAIL' in text:
                email_logs.append(log)
            
            if 'ERROR' in text or 'Error' in text or 'error' in text:
                error_logs.append(log)
        
        print(f"[1] Encontrados {len(email_logs)} logs relacionados con emails")
        print(f"[2] Encontrados {len(error_logs)} logs de error")
        print()
        
        # Mostrar logs de email más recientes
        if email_logs:
            print("=" * 70)
            print("  LOGS DE EMAIL (más recientes)")
            print("=" * 70)
            print()
            
            # Ordenar por timestamp
            email_logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            for log in email_logs[:20]:
                timestamp = log.get('timestamp', 'N/A')
                text = log.get('textPayload', '') or str(log.get('jsonPayload', {}))
                
                # Filtrar solo logs relevantes
                if any(keyword in text for keyword in ['sendLeadEmail', 'Email de lead enviado', 'ERROR enviando email', 'EMAIL_FROM', 'EMAIL_TO']):
                    print(f"[{timestamp}] {text[:200]}")
                    print()
        
        # Mostrar errores recientes
        if error_logs:
            print("=" * 70)
            print("  ERRORES RECIENTES")
            print("=" * 70)
            print()
            
            error_logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            for log in error_logs[:10]:
                timestamp = log.get('timestamp', 'N/A')
                text = log.get('textPayload', '') or str(log.get('jsonPayload', {}))
                print(f"[{timestamp}] {text[:300]}")
                print()
        
        # Buscar específicamente logs de envío exitoso
        print("=" * 70)
        print("  VERIFICACIÓN DE ENVÍOS EXITOSOS")
        print("=" * 70)
        print()
        
        exitosos = [log for log in email_logs if 'Email de lead enviado' in str(log.get('textPayload', '')) or 'exitosamente' in str(log.get('textPayload', '')).lower()]
        
        if exitosos:
            print(f"✓ Se encontraron {len(exitosos)} envíos exitosos")
            for log in exitosos[:5]:
                timestamp = log.get('timestamp', 'N/A')
                text = log.get('textPayload', '') or str(log.get('jsonPayload', {}))
                print(f"  [{timestamp}] {text[:150]}")
        else:
            print("⚠ No se encontraron logs de envío exitoso")
            print("  Esto puede indicar que:")
            print("  - Los emails no se están enviando")
            print("  - Hay un error en el proceso de envío")
            print("  - Los logs no están apareciendo aún")
        
    except subprocess.CalledProcessError as e:
        print(f"Error ejecutando comando: {e}")
        print(f"Salida: {e.stdout}")
        print(f"Error: {e.stderr}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    obtener_logs_recientes()

