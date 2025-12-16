# Cómo Actualizar GitHub y Forzar Despliegue Automático

## Problema
A veces el trigger automático de Cloud Build no se dispara cuando haces push normal a GitHub.

## Solución: Commit Vacío para Forzar Trigger

### Pasos:

1. **Hacer commit vacío:**
   ```powershell
   git commit --allow-empty -m "Trigger: Forzar despliegue automático del código"
   ```

2. **Push a GitHub:**
   ```powershell
   git push origin main
   ```

3. **Verificar que el build se disparó:**
   ```powershell
   gcloud builds list --project=check-in-sf --limit=1 --format="value(id,status,createTime)" --ongoing
   ```

4. **Monitorear el build:**
   ```powershell
   gcloud builds describe [BUILD_ID] --project=check-in-sf --format="value(status)"
   ```

## Alternativa: Build Manual

Si el trigger no funciona, puedes hacer un build manual:

```powershell
gcloud builds submit --config=cloudbuild.yaml --project=check-in-sf --substitutions=_IMAGE_TAG=manual-$(Get-Date -Format "yyyyMMdd-HHmmss")
```

## Verificar Despliegue

```powershell
gcloud run services describe mfs-lead-generation-ai --region=us-central1 --project=check-in-sf --format="value(status.latestReadyRevisionName)"
```


