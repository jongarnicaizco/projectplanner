# Verificar que el Workflow está en GitHub

## Pasos para Verificar

1. **Ve a tu repositorio en GitHub:**
   ```
   https://github.com/jongarnicaizco/mfs-lead-generation-ai
   ```

2. **Verifica que existe la carpeta `.github`:**
   - Deberías ver `.github/workflows/deploy.yml` en el árbol de archivos
   - O ve directamente a: https://github.com/jongarnicaizco/mfs-lead-generation-ai/tree/main/.github/workflows

3. **Verifica en Actions:**
   - Ve a: https://github.com/jongarnicaizco/mfs-lead-generation-ai/actions
   - Deberías ver un workflow llamado "Deploy to Cloud Run"
   - Si no aparece, el archivo no está en GitHub

## Si el Workflow NO está en GitHub

Ejecuta estos comandos manualmente:

```powershell
cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

# 1. Verificar que existe localmente
Test-Path ".github\workflows\deploy.yml"

# 2. Añadir a git
git add .github/workflows/deploy.yml

# 3. Verificar que está en staging
git status

# 4. Commit
git commit -m "Add: GitHub Actions workflow"

# 5. Push
git push origin main
```

## Después del Push

1. **Espera unos segundos** y refresca la página de Actions
2. **Deberías ver el workflow** aparecer en la lista
3. **Si ya configuraste el secret `GCP_SA_KEY`**, el workflow se ejecutará automáticamente
4. **Si no está configurado**, verás un error en los logs del workflow

## Verificar el Secret

1. Ve a: https://github.com/jongarnicaizco/mfs-lead-generation-ai/settings/secrets/actions
2. Deberías ver un secret llamado `GCP_SA_KEY`
3. Si no existe, créalo con el JSON de la service account

