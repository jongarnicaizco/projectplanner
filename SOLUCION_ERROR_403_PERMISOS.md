# Solución: Error 403 "Insufficient Permission" al Enviar Emails

## 🔴 Problema Identificado

Los logs muestran:
```
[mfs] Email: ✗ ERROR enviando email {
  errorMessage: 'Insufficient Permission',
  errorCode: 403
}
```

El servicio **no tiene permisos** para enviar emails usando la API de Gmail.

## 🔍 Causa

El servicio está usando OAuth para autenticarse con Gmail, pero:
1. El token OAuth puede no tener el scope `gmail.send`
2. La cuenta de servicio puede no tener permisos
3. El OAuth puede no estar configurado correctamente

## ✅ Soluciones

### Opción 1: Verificar Scopes de OAuth

El OAuth debe tener estos scopes:
- `https://www.googleapis.com/auth/gmail.send` (para enviar emails)
- `https://www.googleapis.com/auth/gmail.readonly` (para leer emails)

**Verificar en el código:**
- Busca dónde se configura el OAuth client
- Verifica que incluya `gmail.send` en los scopes

### Opción 2: Usar Service Account con Domain-Wide Delegation

Si el servicio usa una Service Account, necesita:
1. Habilitar Domain-Wide Delegation
2. Configurar los scopes en Google Workspace Admin
3. Usar impersonation para enviar como `media.manager@feverup.com`

### Opción 3: Verificar Token OAuth

El token OAuth debe tener permisos para:
- Enviar emails desde `media.manager@feverup.com`
- Usar la API de Gmail

**Pasos:**
1. Verifica que el token OAuth esté actualizado
2. Verifica que tenga los scopes correctos
3. Regenera el token si es necesario

### Opción 4: Usar Gmail API con Service Account

Si no puedes usar OAuth, puedes:
1. Crear una Service Account
2. Configurar Domain-Wide Delegation
3. Usar impersonation para enviar emails

## 🔧 Verificación Rápida

### 1. Verificar cuenta de servicio del servicio:
```powershell
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(spec.template.spec.serviceAccountName)"
```

### 2. Verificar permisos de la cuenta:
```powershell
gcloud projects get-iam-policy check-in-sf --flatten="bindings[].members" --filter="bindings.members:serviceAccount:*"
```

### 3. Verificar configuración de OAuth en el código:
- Busca `services/gmail.js`
- Verifica los scopes configurados
- Verifica cómo se obtiene el token

## 📝 Próximos Pasos

1. **Revisar `services/gmail.js`** para ver cómo se autentica
2. **Verificar los scopes de OAuth** configurados
3. **Regenerar el token OAuth** si es necesario con los scopes correctos
4. **O configurar Domain-Wide Delegation** si usas Service Account

## 🚨 Importante

El servicio necesita permisos explícitos para **enviar emails** usando la API de Gmail. Solo leer emails no es suficiente.

