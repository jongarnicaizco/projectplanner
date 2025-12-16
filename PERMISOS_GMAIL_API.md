# Permisos Necesarios para Gmail API

## 🔍 Operaciones que Realiza el Servicio

Basándome en el código, el servicio realiza estas operaciones con Gmail:

### 1. **Leer Emails**
- `gmail.users.messages.list()` - Listar mensajes del INBOX
- `gmail.users.messages.get()` - Obtener contenido de mensajes
- `gmail.users.messages.list()` con filtro `in:inbox` - Escanear INBOX

### 2. **Obtener Historial de Cambios**
- `gmail.users.history.list()` - Obtener cambios desde un historyId
- `gmail.users.getProfile()` - Obtener historyId del perfil

### 3. **Configurar Watch (Notificaciones)**
- `gmail.users.watch()` - Configurar notificaciones de nuevos emails

### 4. **Enviar Emails** (Opcional - actualmente no se usa, pero el código lo tiene)
- `gmail.users.messages.send()` - Enviar emails

## ✅ Scopes Necesarios

### Scope Mínimo (Solo Lectura)
```
https://www.googleapis.com/auth/gmail.readonly
```
**Permite:**
- ✅ Leer emails
- ✅ Obtener historial de cambios
- ✅ Configurar watch
- ❌ NO permite enviar emails

### Scope Recomendado (Lectura + Envío)
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly
```
**Permite:**
- ✅ Todo lo del scope readonly
- ✅ Enviar emails

### Scope Alternativo (Todo)
```
https://www.googleapis.com/auth/gmail.modify
```
**Permite:**
- ✅ Leer emails
- ✅ Enviar emails
- ✅ Modificar emails (labels, etc.)
- ✅ Configurar watch

## 🎯 Recomendación

Para tu caso de uso actual (leer emails y guardar en Airtable):

**Scope mínimo necesario:**
```
https://www.googleapis.com/auth/gmail.readonly
```

**Si quieres mantener la opción de enviar emails en el futuro:**
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

O simplemente:
```
https://www.googleapis.com/auth/gmail.modify
```

## 🔧 Verificar Scopes del Refresh Token Actual

Para verificar qué scopes tiene tu refresh token actual:

1. Ve a: https://myaccount.google.com/permissions
2. Busca la aplicación autorizada
3. Verifica los permisos que tiene

O puedes verificar en los logs cuando se crea el cliente OAuth - debería mostrar los scopes autorizados.

## ⚠️ Importante

- El refresh token debe tener **al menos** `gmail.readonly` para que el servicio funcione
- Si solo tiene `gmail.readonly`, no podrá enviar emails (pero eso está bien si solo quieres leer)
- Para configurar Gmail Watch, necesitas `gmail.readonly` o `gmail.modify`

