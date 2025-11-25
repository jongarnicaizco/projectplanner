# mfs-lead-generation-ai

Servicio de generación de leads desde Gmail usando Vertex AI y Airtable.

## Estructura del Proyecto

```
mfs-lead-generation-ai/
├── index.js                 # Punto de entrada principal
├── config.js                # Configuración centralizada
├── package.json
├── Dockerfile
├── services/
│   ├── gmail.js            # Cliente y operaciones de Gmail
│   ├── vertex.js            # Clasificación con Vertex AI
│   ├── airtable.js          # Operaciones con Airtable
│   ├── storage.js           # Operaciones con GCS
│   ├── secrets.js           # Gestión de secretos
│   └── processor.js         # Procesador de mensajes
├── handlers/
│   ├── pubsub.js           # Handler de Pub/Sub
│   └── debug.js            # Endpoints de debug
└── utils/
    └── helpers.js          # Utilidades y helpers
```

## Características

- ✅ Procesa solo correos de INBOX
- ✅ Cola controlada por Gmail History + locks en GCS
- ✅ Vertex AI 2.x con fallbacks automáticos
- ✅ Backoff anti-429
- ✅ Lock en GCS por messageId para evitar duplicados
- ✅ Endpoints de debug
- ✅ Handler de Pub/Sub para notificaciones Gmail

## Variables de Entorno

```bash
# GCP
GOOGLE_CLOUD_PROJECT=tu-proyecto
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-3.0-flash
GCS_BUCKET=tu-bucket

# Gmail
GMAIL_ADDRESS=tu-email@gmail.com
AUTH_MODE=oauth  # o 'dwd' para domain-wide delegation

# Pub/Sub
PUBSUB_TOPIC=mfs-gmail-leads

# Airtable
AIRTABLE_BASE_ID=tu-base-id
AIRTABLE_TABLE=nombre-tabla
AIRTABLE_TOKEN_SECRET=AIRTABLE_API_KEY

# Opcional
RESET_ON_START=false
SKIP_VERTEX=false
SKIP_AIRTABLE=false
DEBUG_SCAN_MAX=20
```

## Instalación Local

```bash
npm install
npm start
```

## Despliegue en Cloud Run

El proyecto está listo para desplegarse en Cloud Run con Node.js 22.

### Usando gcloud CLI

```bash
gcloud run deploy mfs-lead-generation-ai \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

### Usando el script de Python

```bash
python cloud_run_manager.py us-central1 mfs-lead-generation-ai ./mfs-lead-generation-ai
```

## Endpoints

- `GET /healthz` - Health check
- `GET /vertex/status` - Estado de Vertex AI
- `POST /reset` - Reinicia watch e historyId
- `POST /watch` - Configura watch de Gmail
- `POST /_pubsub` - Handler de notificaciones Pub/Sub
- `GET /debug/labels` - Lista etiquetas de Gmail
- `GET /debug/msg?id=...` - Info de un mensaje
- `POST /debug/scan` - Escanea INBOX (backup)

## Mejoras Implementadas

1. **Modularización**: Código separado en servicios y handlers
2. **Configuración centralizada**: Todo en `config.js`
3. **Manejo de errores mejorado**: Logs estructurados
4. **Optimizaciones**: Imports estáticos, menos duplicación
5. **Mantenibilidad**: Código más legible y organizado


