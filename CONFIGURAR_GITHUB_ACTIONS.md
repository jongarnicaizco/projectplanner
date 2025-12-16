# Configurar GitHub Actions para Deploy Automático

## Estado Actual

He creado el workflow `.github/workflows/deploy.yml` que se activará automáticamente cuando hagas push a `main`.

## Pasos para Activar GitHub Actions

### 1. Configurar el Secret de Google Cloud

GitHub Actions necesita autenticarse con Google Cloud. Necesitas crear un secret:

1. **Ve a la página de secrets:**
   ```
   https://github.com/jongarnicaizco/mfs-lead-generation-ai/settings/secrets/actions
   ```

2. **Crea un nuevo secret:**
   - Nombre: `GCP_SA_KEY`
   - Valor: El JSON completo de la service account de Google Cloud

3. **Para obtener el JSON de la service account:**
   ```powershell
   # Listar service accounts
   gcloud iam service-accounts list --project=check-in-sf
   
   # Crear una key para la service account (si no existe)
   # Reemplaza SERVICE_ACCOUNT_EMAIL con el email de la service account
   gcloud iam service-accounts keys create key.json \
     --iam-account=SERVICE_ACCOUNT_EMAIL \
     --project=check-in-sf
   
   # El contenido de key.json es lo que necesitas poner en el secret
   ```

### 2. Verificar que el Workflow Funciona

Después de hacer push, verifica:

1. **Ve a Actions:**
   ```
   https://github.com/jongarnicaizco/mfs-lead-generation-ai/actions
   ```

2. **Deberías ver un workflow ejecutándose** llamado "Deploy to Cloud Run"

3. **Si falla**, revisa los logs para ver el error

## Hacer Push Ahora

Ejecuta este script para hacer push y activar GitHub Actions:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
.\PUSH_Y_ACTIVAR_ACTIONS.ps1
```

## Si GitHub Actions No Está Configurado

Si no tienes el secret `GCP_SA_KEY` configurado, puedes hacer el deploy manualmente:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
$tag = "email-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$subs = "_IMAGE_TAG=$tag,_SERVICE_NAME=mfs-lead-generation-ai,_REGION=us-central1,_REPOSITORY=cloud-run-source-deploy,_AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,_AIRTABLE_TABLE=tblPIUeGJWqOtqage,_AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY"
gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=$subs
```

## Verificación

Después del deploy:

1. **Verifica en Cloud Run:**
   - https://console.cloud.google.com/run?project=check-in-sf
   - El servicio `mfs-lead-generation-ai` debería tener un nuevo deployment

2. **Prueba el email:**
   - Cuando se procese un correo, deberías recibir "test" en `jongarnicaizco@gmail.com`
   - El email viene de `secretmedia@feverup.com`

