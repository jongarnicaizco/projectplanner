# Permisos Necesarios para Pub/Sub

## 🔍 Contexto

El servicio `mfs-lead-generation-ai` usa **Pub/Sub** para recibir notificaciones en tiempo real de Gmail cuando llegan nuevos emails. Para que esto funcione correctamente, se necesitan varios permisos:

## ✅ Permisos Necesarios

### 1. **Cloud Run debe permitir invocaciones no autenticadas**

**Para qué:** Pub/Sub necesita poder invocar el endpoint `/_pubsub` del servicio Cloud Run.

**Cómo verificar:**
```powershell
gcloud run services get-iam-policy mfs-lead-generation-ai --region=us-central1 --project=check-in-sf
```

**Cómo configurar:**
```powershell
# Opción 1: Permitir a todos (más simple)
gcloud run services add-iam-policy-binding mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --member="allUsers" `
  --role="roles/run.invoker"

# O usar --allow-unauthenticated al desplegar
gcloud run services update mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --allow-unauthenticated
```

### 2. **El topic de Pub/Sub debe existir en el proyecto correcto**

**Para qué:** Gmail Watch necesita un topic de Pub/Sub para enviar notificaciones.

**Proyecto:** `smn-content-v2` (según `PUBSUB_PROJECT_ID`)
**Topic:** `mfs-gmail-leads`

**Cómo verificar:**
```powershell
gcloud pubsub topics describe mfs-gmail-leads --project=smn-content-v2
```

**Cómo crear (si no existe):**
```powershell
gcloud pubsub topics create mfs-gmail-leads --project=smn-content-v2
```

### 3. **La cuenta de servicio de Cloud Run necesita permisos en Pub/Sub** (Opcional)

**Para qué:** Si el servicio necesita leer o escribir en Pub/Sub directamente (aunque en este caso solo recibe notificaciones).

**Permisos necesarios:**
- `roles/pubsub.subscriber` - Para leer mensajes
- `roles/pubsub.editor` - Para leer y escribir (más permisos)

**Cómo verificar:**
```powershell
# Obtener cuenta de servicio del servicio
$serviceAccount = (gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(spec.template.spec.serviceAccountName)")

# Verificar permisos
gcloud projects get-iam-policy smn-content-v2 --flatten="bindings[].members" --filter="bindings.members:serviceAccount:$serviceAccount"
```

**Cómo configurar:**
```powershell
# Obtener cuenta de servicio
$projectNumber = (gcloud projects describe check-in-sf --format="value(projectNumber)")
$serviceAccount = "$projectNumber-compute@developer.gserviceaccount.com"

# Agregar permiso
gcloud projects add-iam-policy-binding smn-content-v2 `
  --member="serviceAccount:$serviceAccount" `
  --role="roles/pubsub.subscriber"
```

### 4. **La cuenta de servicio de Pub/Sub necesita permiso para invocar Cloud Run** (Si no usas allUsers)

**Para qué:** Si NO usas `allUsers`, la cuenta de servicio de Pub/Sub necesita permiso explícito para invocar Cloud Run.

**Cuenta de servicio de Pub/Sub:**
```
service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com
```

**Cómo verificar:**
```powershell
# Obtener número de proyecto
$projectNumber = (gcloud projects describe check-in-sf --format="value(projectNumber)")
$pubsubServiceAccount = "service-$projectNumber@gcp-sa-pubsub.iam.gserviceaccount.com"

# Verificar si tiene permiso
gcloud run services get-iam-policy mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="json" | ConvertFrom-Json | Select-Object -ExpandProperty bindings | Where-Object { $_.members -contains "serviceAccount:$pubsubServiceAccount" }
```

**Cómo configurar:**
```powershell
# Obtener número de proyecto
$projectNumber = (gcloud projects describe check-in-sf --format="value(projectNumber)")
$pubsubServiceAccount = "service-$projectNumber@gcp-sa-pubsub.iam.gserviceaccount.com"

# Agregar permiso
gcloud run services add-iam-policy-binding mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --member="serviceAccount:$pubsubServiceAccount" `
  --role="roles/run.invoker"
```

## 🎯 Configuración Recomendada (Más Simple)

**La forma más simple es usar `allUsers`:**

```powershell
# 1. Permitir invocaciones no autenticadas
gcloud run services add-iam-policy-binding mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --member="allUsers" `
  --role="roles/run.invoker"

# 2. Verificar que el topic existe
gcloud pubsub topics describe mfs-gmail-leads --project=smn-content-v2

# Si no existe, crearlo:
gcloud pubsub topics create mfs-gmail-leads --project=smn-content-v2
```

## ⚠️ Notas Importantes

1. **El topic debe estar en el proyecto correcto:** Según la configuración, el topic debe estar en `smn-content-v2`, no en `check-in-sf`.

2. **Gmail Watch requiere que el topic esté en el proyecto asociado a la cuenta de Gmail:** Si la cuenta de Gmail (`media.manager@feverup.com`) está asociada al proyecto `smn-content-v2`, el topic debe estar ahí.

3. **El servicio Cloud Run puede estar en un proyecto diferente:** El servicio está en `check-in-sf`, pero puede recibir notificaciones de Pub/Sub de `smn-content-v2`.

## 🔧 Script de Verificación

Ejecuta el script `verificar_permisos_pubsub.ps1` para verificar automáticamente todos estos permisos:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
powershell -ExecutionPolicy Bypass -File "verificar_permisos_pubsub.ps1"
```

