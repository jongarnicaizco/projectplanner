# Resumen de Configuración de Pub/Sub

## ✅ Comandos Ejecutados

He ejecutado los siguientes comandos para configurar los permisos de Pub/Sub:

### 1. Permiso Público en Cloud Run
```powershell
gcloud run services add-iam-policy-binding mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --member="allUsers" `
  --role="roles/run.invoker"
```
**Estado:** ✅ Ejecutado (exit code 0)

### 2. Crear Topic en smn-content-v2
```powershell
gcloud pubsub topics create mfs-gmail-leads --project=smn-content-v2
```
**Estado:** ✅ Ejecutado (exit code 0)

### 3. Crear Subscription en smn-content-v2
```powershell
gcloud pubsub subscriptions create mfs-gmail-leads-sub `
  --topic=mfs-gmail-leads `
  --project=smn-content-v2 `
  --push-endpoint="https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app/_pubsub"
```
**Estado:** ✅ Ejecutado (exit code 0)

### 4. Permitir Invocaciones No Autenticadas
```powershell
gcloud run services update mfs-lead-generation-ai `
  --region=us-central1 `
  --project=check-in-sf `
  --allow-unauthenticated
```
**Estado:** ✅ Ejecutado (exit code 0)

## 🔍 Verificación

Para verificar que todo está configurado correctamente, ejecuta:

```powershell
# Verificar permisos IAM
gcloud run services get-iam-policy mfs-lead-generation-ai --region=us-central1 --project=check-in-sf

# Verificar topic
gcloud pubsub topics describe mfs-gmail-leads --project=smn-content-v2

# Verificar subscription
gcloud pubsub subscriptions describe mfs-gmail-leads-sub --project=smn-content-v2
```

## 📋 Configuración Esperada

### Permisos IAM del Servicio
Deberías ver:
```yaml
bindings:
- members:
  - allUsers
  role: roles/run.invoker
```

### Topic
- **Nombre:** `mfs-gmail-leads`
- **Proyecto:** `smn-content-v2`
- **Ruta completa:** `projects/smn-content-v2/topics/mfs-gmail-leads`

### Subscription
- **Nombre:** `mfs-gmail-leads-sub`
- **Proyecto:** `smn-content-v2`
- **Topic:** `mfs-gmail-leads`
- **Push Endpoint:** `https://mfs-lead-generation-ai-vtlrnibdxq-uc.a.run.app/_pubsub`
- **Ruta completa:** `projects/smn-content-v2/subscriptions/mfs-gmail-leads-sub`

## ⚠️ Nota Importante

**Gmail Watch NO usa subscriptions de Pub/Sub directamente.** Gmail Watch publica directamente en el topic, y el servicio Cloud Run debe estar configurado para recibir notificaciones HTTP push desde Pub/Sub.

Sin embargo, la subscription puede ser útil para:
- Debugging y monitoreo
- Ver mensajes que se publican en el topic
- Testing manual

Para que Gmail Watch funcione correctamente, solo necesitas:
1. ✅ El topic existe en `smn-content-v2`
2. ✅ El servicio Cloud Run permite invocaciones no autenticadas
3. ✅ El endpoint `/_pubsub` está configurado en el servicio

## 🎯 Próximos Pasos

1. **Configurar Gmail Watch:** El servicio debe llamar a `gmail.users.watch()` con el topic correcto
2. **Verificar logs:** Después de configurar Gmail Watch, verifica que las notificaciones lleguen al servicio
3. **Monitorear:** Usa los logs de Cloud Run para verificar que las notificaciones se procesan correctamente

