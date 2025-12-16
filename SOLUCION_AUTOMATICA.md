# Solución Automática para Push y Deploy

## Problema
Los comandos de git desde Cursor no están funcionando correctamente debido a problemas de autenticación o captura de salida.

## Solución: Script Automático con Autenticación

He creado el script `AUTO_PUSH_DEPLOY.ps1` que:
1. Configura git con autenticación automática
2. Hace commit de los cambios
3. Hace push a GitHub
4. Despliega automáticamente a Cloud Run

## Cómo Usar

### Opción 1: Ejecutar el Script Manualmente

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
.\AUTO_PUSH_DEPLOY.ps1
```

Este script:
- ✅ Configura git automáticamente
- ✅ Usa el token de GitHub para autenticación
- ✅ Hace commit y push
- ✅ Despliega a Cloud Run

### Opción 2: GitHub Actions (Recomendado para el Futuro)

He creado `.github/workflows/deploy.yml` que despliega automáticamente cuando haces push a `main`.

**Para activarlo:**
1. Ve a: https://github.com/jongarnicaizco/mfs-lead-generation-ai/settings/secrets/actions
2. Añade un secret llamado `GCP_SA_KEY` con el JSON de la service account de Google Cloud
3. Cada vez que hagas push a `main`, GitHub Actions desplegará automáticamente

### Opción 3: Usar la Interfaz de Cursor

1. Abre el panel de Git (Ctrl+Shift+G)
2. Haz commit de los cambios
3. Haz push usando la interfaz visual
4. Ejecuta el script de deploy manualmente

## Verificación

Después de ejecutar el script, verifica:

1. **En GitHub:**
   - Ve a: https://github.com/jongarnicaizco/mfs-lead-generation-ai
   - Verifica que existe `services/email-sender.js`
   - Verifica el último commit

2. **En Cloud Run:**
   - Ve a: https://console.cloud.google.com/run?project=check-in-sf
   - Verifica que el servicio `mfs-lead-generation-ai` tiene un nuevo deployment

3. **Probar el email:**
   - Cuando se procese un correo, deberías recibir "test" en `jongarnicaizco@gmail.com`

## Si el Script No Funciona

1. **Verifica que tienes el token de GitHub:**
   - El script usa: `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`
   - Si este token expiró, actualízalo en el script

2. **Verifica permisos de gcloud:**
   ```powershell
   gcloud auth list
   gcloud config set project check-in-sf
   ```

3. **Ejecuta los comandos manualmente:**
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   git add services/email-sender.js services/processor.js
   git commit -m "Add: Enviar email de prueba"
   git push origin main
   ```

## Próximos Pasos

Para hacer el proceso completamente automático:
1. Configura GitHub Actions con el secret `GCP_SA_KEY`
2. Cada push a `main` desplegará automáticamente
3. No necesitarás ejecutar scripts manualmente

