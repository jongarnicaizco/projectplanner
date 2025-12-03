# Instrucciones para Reautenticarse con GitHub

## Problema
Los comandos de git no están funcionando correctamente, posiblemente por problemas de autenticación.

## Solución: Reautenticarse

### Opción 1: Usar GitHub CLI (recomendado)
```powershell
# Instalar GitHub CLI si no está instalado
winget install GitHub.cli

# Autenticarse
gh auth login

# Seguir las instrucciones en pantalla
```

### Opción 2: Configurar credenciales manualmente
```powershell
# Ver configuración actual
git config --global user.name
git config --global user.email

# Configurar (si es necesario)
git config --global user.name "Tu Nombre"
git config --global user.email "tu-email@ejemplo.com"
```

### Opción 3: Usar Personal Access Token
1. Ve a: https://github.com/settings/tokens
2. Genera un nuevo token con permisos `repo`
3. Cuando hagas push, usa el token como contraseña:
   ```powershell
   git push origin main
   # Username: tu-usuario
   # Password: [pegar el token]
   ```

### Opción 4: Usar SSH en lugar de HTTPS
```powershell
# Ver el remoto actual
git remote -v

# Si es HTTPS, cambiar a SSH
git remote set-url origin git@github.com:jongarnicaizco/mfs-lead-generation-ai.git

# Verificar
git remote -v
```

## Verificar después de reautenticarse
```powershell
# Probar conexión
git ls-remote origin HEAD

# Si funciona, hacer push
git push origin main
```

