# Scopes de Gmail API Necesarios

## 🔍 Operaciones que Realiza el Servicio

Basándome en el código, el servicio realiza estas operaciones:

### 1. **Leer Emails** ✅ REQUERIDO
- `gmail.users.messages.list()` - Listar mensajes del INBOX
- `gmail.users.messages.get()` - Obtener contenido completo de mensajes
- `gmail.users.getProfile()` - Obtener historyId del perfil

### 2. **Obtener Historial de Cambios** ✅ REQUERIDO
- `gmail.users.history.list()` - Obtener cambios desde un historyId específico

### 3. **Configurar Watch (Notificaciones)** ✅ REQUERIDO
- `gmail.users.watch()` - Configurar notificaciones de nuevos emails en INBOX

### 4. **Enviar Emails** ⚠️ OPCIONAL (código existe pero no se usa actualmente)
- `gmail.users.messages.send()` - Enviar emails (solo si quieres mantener esta funcionalidad)

## ✅ Scopes Necesarios

### Opción 1: Solo Lectura (Mínimo Necesario) ⭐ RECOMENDADO

```
https://www.googleapis.com/auth/gmail.readonly
```

**Permite:**
- ✅ Leer emails del INBOX
- ✅ Obtener historial de cambios
- ✅ Configurar Gmail Watch
- ✅ Obtener perfil del usuario
- ❌ NO permite enviar emails

**Es suficiente para:**
- Procesar emails entrantes
- Guardar datos en Airtable
- Recibir notificaciones de nuevos emails

### Opción 2: Lectura + Envío

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

**Permite:**
- ✅ Todo lo del scope readonly
- ✅ Enviar emails

**Úsalo si:**
- Quieres mantener la opción de enviar emails en el futuro
- Necesitas enviar notificaciones por email

### Opción 3: Todo (Modificar)

```
https://www.googleapis.com/auth/gmail.modify
```

**Permite:**
- ✅ Leer emails
- ✅ Enviar emails
- ✅ Modificar emails (agregar/quitar labels, marcar como leído, etc.)
- ✅ Configurar watch

**Úsalo si:**
- Necesitas modificar emails (por ejemplo, mover a otra carpeta después de procesar)

## 🎯 Recomendación para tu Caso

**Para tu caso actual (leer emails y guardar en Airtable):**

```
https://www.googleapis.com/auth/gmail.readonly
```

**Es suficiente** porque:
- Solo necesitas leer emails del INBOX
- No necesitas enviar emails (guardas en Airtable)
- No necesitas modificar emails

## 🔧 Verificar Scopes del Refresh Token Actual

Para verificar qué scopes tiene tu refresh token:

1. **Ve a:** https://myaccount.google.com/permissions
2. **Busca** la aplicación autorizada
3. **Verifica** los permisos que tiene

O verifica en los logs cuando se crea el cliente OAuth.

## ⚠️ Importante

- El refresh token **debe tener al menos** `gmail.readonly` para que el servicio funcione
- Si el refresh token no tiene los scopes correctos, obtendrás errores `unauthorized_client` o `insufficient_permission`
- Para configurar Gmail Watch, necesitas `gmail.readonly` o `gmail.modify`

## 📝 Resumen

**Scope mínimo necesario:**
```
https://www.googleapis.com/auth/gmail.readonly
```

**Si quieres mantener opción de enviar emails:**
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

