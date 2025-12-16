# Instrucciones para Push desde Cursor

## Opción 1: Interfaz Visual de Cursor

1. **Abre el panel de Git:**
   - Haz clic en el icono de Git en la barra lateral izquierda
   - O presiona `Ctrl+Shift+G`

2. **Verifica que todos los cambios estén commiteados:**
   - Si hay cambios sin commit, haz commit primero
   - Mensaje sugerido: "ELIMINAR AIRTABLE COMPLETAMENTE - Reemplazar con envío de emails"

3. **Haz push:**
   - Haz clic en los tres puntos (⋯) en la parte superior del panel de Git
   - Selecciona "Push" o "Sync"
   - Si te pide credenciales:
     - Usuario: `jongarnicaizco`
     - Contraseña: `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` (tu token)

## Opción 2: Terminal Integrada de Cursor

1. **Abre la terminal:**
   - Presiona `Ctrl+`` (backtick)
   - O ve a: Terminal → New Terminal

2. **Navega al directorio:**
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   ```

3. **Configura el remoto (sin token en URL):**
   ```powershell
   git remote set-url origin https://github.com/jongarnicaizco/mfs-lead-generation-ai.git
   ```

4. **Haz push:**
   ```powershell
   git push origin main
   ```

5. **Si te pide credenciales:**
   - Usuario: `jongarnicaizco`
   - Contraseña: `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`

## Opción 3: GitHub CLI (si está instalado)

1. **Autentícate:**
   ```powershell
   gh auth login
   ```
   - Selecciona GitHub.com
   - Selecciona HTTPS
   - Autentica con navegador o token

2. **Haz push:**
   ```powershell
   cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
   git push origin main
   ```

## Verificar que Funcionó

Después del push, verifica en GitHub:
- https://github.com/jongarnicaizco/mfs-lead-generation-ai
- Debe aparecer el commit: "ELIMINAR AIRTABLE COMPLETAMENTE - Reemplazar con envío de emails"
- Debe existir el archivo `services/email.js`

## Si Sigue Fallando

1. Verifica que el token tenga permisos `repo` completos:
   - https://github.com/settings/tokens
   - Busca "cloudgithub"
   - Debe tener `repo` (todo) marcado

2. Si no, crea un nuevo token:
   - https://github.com/settings/tokens/new
   - Nombre: "cursor-push-token"
   - Scope: `repo` (todo)
   - Úsalo como contraseña cuando Git lo pida

