# Refresh Token Actualizado

## ✅ Token Actualizado

El refresh token ha sido actualizado en Google Cloud Secret Manager.

**Secret:** `GMAIL_REFRESH_TOKEN`  
**Proyecto:** `check-in-sf`

## 🔍 Verificación

Para verificar que el token se actualizó correctamente:

```powershell
gcloud secrets versions access latest --secret="GMAIL_REFRESH_TOKEN" --project=check-in-sf
```

## 📝 Próximos Pasos

1. **El servicio debería usar automáticamente el nuevo token** (no necesitas redesplegar)

2. **Espera unos minutos** para que el servicio obtenga el nuevo token del Secret Manager

3. **Prueba enviando un email** - el próximo email que se procese debería enviarse correctamente

4. **Verifica los logs** para confirmar que el envío funciona:
   ```powershell
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mfs-lead-generation-ai" AND textPayload=~"Email.*enviado exitosamente"' --limit=5 --format="table(timestamp,textPayload)" --project=check-in-sf --freshness=10m
   ```

## ⚠️ Importante

- Asegúrate de que el refresh token tenga los scopes correctos:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`

- Si el token no tiene `gmail.send`, seguirás obteniendo el error 403.

- Si necesitas regenerar el token con los scopes correctos, usa el script `regenerar_refresh_token.js`

## 🚨 Si Sigue Fallando

Si después de actualizar el token sigues viendo el error 403:

1. Verifica que el token tenga el scope `gmail.send`
2. Regenera el token usando el script `regenerar_refresh_token.js`
3. Asegúrate de autorizar con la cuenta `media.manager@feverup.com`

