# Script para hacer push a GitHub
# Ejecuta este script manualmente en PowerShell

cd "C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"

# Eliminar .github/workflows del staging si existe (para evitar error de scope workflow)
git rm --cached .github/workflows/deploy.yml 2>&1 | Out-Null

# Añadir todos los cambios
git add -A

# Si hay un archivo .github/workflows en el staging, eliminarlo
git reset .github/workflows/deploy.yml 2>&1 | Out-Null

# Hacer commit
git commit -m "Update: Cambios desde Cursor AI"

# Hacer push
git push origin main
