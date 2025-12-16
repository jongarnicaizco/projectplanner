# Permisos necesarios para secretmedia@feverup.com

## 1. Gmail API - Scopes OAuth 2.0

La cuenta `secretmedia@feverup.com` necesita el siguiente scope de Gmail API:

```
https://www.googleapis.com/auth/gmail.modify
```

Este scope permite:
- ✅ Leer mensajes de Gmail
- ✅ Modificar mensajes (agregar/quitar etiquetas como "processed")
- ✅ Enviar emails
- ✅ Usar Gmail Watch API para recibir notificaciones en tiempo real

## 2. OAuth 2.0 Credentials

Necesitas crear un **OAuth 2.0 Client** en Google Cloud Console (proyecto `check-in-sf`) con:

### Configuración del OAuth Client:
- **Tipo**: Aplicación de escritorio (Desktop app) o Aplicación web (Web application)
- **Nombre**: Puede ser cualquier nombre (ej: "MFS Gmail SENDER Client")
- **Authorized redirect URIs**: 
  - `http://localhost:3000/oauth2callback` (o el URI configurado en `GMAIL_REDIRECT_URI`)

### Secrets en Secret Manager:
Debes guardar estos 3 secrets en Google Secret Manager (proyecto `check-in-sf`):

1. **`GMAIL_CLIENT_ID_SENDER`**: Client ID del OAuth Client
2. **`GMAIL_CLIENT_SECRET_SENDER`**: Client Secret del OAuth Client  
3. **`GMAIL_REFRESH_TOKEN_SENDER`**: Refresh Token generado para `secretmedia@feverup.com`

## 3. Generar Refresh Token

Para generar el Refresh Token:

1. Usa el OAuth 2.0 Playground de Google: https://developers.google.com/oauthplayground/
2. O usa un script de autorización OAuth que:
   - Use el Client ID y Client Secret
   - Solicite el scope `https://www.googleapis.com/auth/gmail.modify`
   - Genere un Refresh Token para `secretmedia@feverup.com`

## 4. Pub/Sub Topic

Necesitas crear un **Pub/Sub Topic** en el proyecto `check-in-sf`:

- **Nombre del topic**: `mfs-gmail-leads-sender` (o el configurado en `PUBSUB_TOPIC_SENDER`)
- **Proyecto**: `check-in-sf`

Este topic recibe las notificaciones de Gmail cuando llegan nuevos emails a `secretmedia@feverup.com`.

## 5. Gmail Watch API

La cuenta `secretmedia@feverup.com` necesita permisos para usar Gmail Watch API, que permite:
- Recibir notificaciones en tiempo real cuando llegan nuevos emails
- El Watch se configura automáticamente cuando el servicio se activa

## Resumen de permisos necesarios

| Permiso/Configuración | Descripción | Dónde configurarlo |
|----------------------|-------------|-------------------|
| **Gmail API Scope** | `gmail.modify` | OAuth Client en Google Cloud Console |
| **OAuth Client** | Client ID y Secret | Google Cloud Console → APIs & Services → Credentials |
| **Refresh Token** | Token de autenticación | Generar con OAuth 2.0 Playground o script |
| **Pub/Sub Topic** | `mfs-gmail-leads-sender` | Google Cloud Console → Pub/Sub |
| **Secret Manager** | 3 secrets (Client ID, Secret, Refresh Token) | Google Cloud Console → Secret Manager |

## Pasos para configurar

1. **Crear OAuth Client** en `check-in-sf`:
   - Ve a: https://console.cloud.google.com/apis/credentials?project=check-in-sf
   - Crea un nuevo OAuth 2.0 Client ID
   - Tipo: Desktop app o Web application
   - Authorized redirect URI: `http://localhost:3000/oauth2callback`

2. **Generar Refresh Token**:
   - Usa OAuth 2.0 Playground o un script
   - Scope: `https://www.googleapis.com/auth/gmail.modify`
   - Autoriza con la cuenta `secretmedia@feverup.com`

3. **Guardar secrets en Secret Manager**:
   - `GMAIL_CLIENT_ID_SENDER`: Client ID del OAuth Client
   - `GMAIL_CLIENT_SECRET_SENDER`: Client Secret del OAuth Client
   - `GMAIL_REFRESH_TOKEN_SENDER`: Refresh Token generado

4. **Crear Pub/Sub Topic**:
   - Ve a: https://console.cloud.google.com/cloudpubsub/topic/list?project=check-in-sf
   - Crea topic: `mfs-gmail-leads-sender`

5. **Habilitar APIs necesarias** (si no están habilitadas):
   - Gmail API
   - Pub/Sub API
   - Secret Manager API

## Verificación

Una vez configurado, el sistema debería poder:
- ✅ Autenticarse con `secretmedia@feverup.com`
- ✅ Leer emails de la cuenta
- ✅ Aplicar etiquetas "processed"
- ✅ Recibir notificaciones de Pub/Sub cuando llegan nuevos emails
- ✅ Configurar Gmail Watch automáticamente

