# Comandos para Configurar Permisos de Pub/Sub

## ✅ Ejecuta estos comandos en orden:

### 1. Agregar permiso público al servicio Cloud Run
```powershell
gcloud run services add-iam-policy-binding mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --member="allUsers" `
  --role="roles/run.invoker"
```

**Resultado esperado:** Debería mostrar que se agregó el binding de IAM.

### 2. Crear el topic de Pub/Sub (si no existe)
```powershell
gcloud pubsub topics create mfs-gmail-leads --project=smn-content-v2
```

**Resultado esperado:** 
- Si el topic ya existe: `ERROR: (gcloud.pubsub.topics.create) Resource already exists`
- Si se crea: `Created topic [projects/smn-content-v2/topics/mfs-gmail-leads]`

### 3. Asegurar que el servicio permite invocaciones no autenticadas
```powershell
gcloud run services update mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --allow-unauthenticated
```

**Resultado esperado:** Debería mostrar que el servicio se actualizó.

### 4. Verificar configuración final

**Verificar permisos IAM:**
```powershell
gcloud run services get-iam-policy mfs-lead-generation-ai --region=us-central1 --project=check-in-sf
```

**Deberías ver algo como:**
```
bindings:
- members:
  - allUsers
  role: roles/run.invoker
```

**Verificar que el topic existe:**
```powershell
gcloud pubsub topics describe mfs-gmail-leads --project=smn-content-v2
```

**Deberías ver información del topic.**

## 🔍 Verificación Adicional

**Verificar que Gmail puede publicar en el topic:**
```powershell
# Ver permisos del topic
gcloud pubsub topics get-iam-policy mfs-gmail-leads --project=smn-content-v2
```

**Gmail automáticamente tiene permisos para publicar en topics cuando se configura Gmail Watch, así que esto debería funcionar automáticamente.**

## ⚠️ Notas

1. **El topic debe estar en `smn-content-v2`** porque es el proyecto asociado a la cuenta de Gmail (`media.manager@feverup.com`).

2. **El servicio Cloud Run está en `check-in-sf`**, pero puede recibir notificaciones de Pub/Sub de `smn-content-v2`.

3. **Si ya ejecutaste estos comandos**, algunos pueden dar errores de "ya existe" o "ya configurado", lo cual es normal y significa que ya está bien configurado.

## 🎯 Resumen de Permisos Necesarios

✅ **Cloud Run permite `allUsers`** → Permite que Pub/Sub invoque el servicio
✅ **Topic existe en `smn-content-v2`** → Gmail puede enviar notificaciones
✅ **Servicio permite invocaciones no autenticadas** → Pub/Sub puede invocar sin autenticación

