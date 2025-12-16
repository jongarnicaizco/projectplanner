# Principio de Optimización - Carga Mínima de Ejecuciones

## ⚠️ REGLA FUNDAMENTAL

**Cualquier cambio en código debe tener la premisa de que la carga de ejecuciones sea lo más mínima posible.**

## Aplicación

- Minimizar llamadas a APIs externas
- Reducir operaciones de I/O (lectura/escritura)
- Optimizar consultas a bases de datos
- Evitar procesamiento redundante
- Usar caché cuando sea posible
- Evitar loops innecesarios
- Priorizar eficiencia sobre conveniencia

## Contexto

Este principio es especialmente importante en:
- Servicios en la nube (Cloud Run) donde se factura por ejecución
- APIs con límites de rate limiting
- Procesamiento de alto volumen
- Operaciones costosas (Vertex AI, Airtable, etc.)

---

**Fecha de creación:** 2025-01-27
**Aplicar siempre en:** Cambios de código, refactorizaciones, nuevas features

