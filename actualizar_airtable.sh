#!/bin/bash
# Script para actualizar variables de Airtable en Cloud Run

PROJECT_ID="check-in-sf"
SERVICE_NAME="mfs-lead-generation-ai"
REGION="us-central1"

echo "=== Actualizando variables de Airtable en Cloud Run ==="
echo ""

echo "Actualizando AIRTABLE_BASE_ID y AIRTABLE_TABLE..."
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --update-env-vars AIRTABLE_BASE_ID=appT0vQS4arJ3dQ6w,AIRTABLE_TABLE=tblPIUeGJWqOtqage

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Variables actualizadas correctamente"
  echo ""
  echo "Esperando 10 segundos para que se despliegue la nueva revisión..."
  sleep 10
  
  echo ""
  echo "Verificando variables actualizadas..."
  gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="value(spec.template.spec.containers[0].env)" | grep AIRTABLE
  
  echo ""
  echo "✓ Servicio actualizado. Los nuevos correos se guardarán en:"
  echo "  Base ID: appT0vQS4arJ3dQ6w"
  echo "  Table ID: tblPIUeGJWqOtqage"
else
  echo ""
  echo "✗ Error al actualizar variables"
  exit 1
fi

