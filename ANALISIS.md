# Análisis de Warefy — Mayo 2026

## Stack & Arquitectura

Next.js 16 + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS + Cloudflare R2 + Recharts. Estructura bien organizada con App Router, separación de rutas protegidas, y RBAC funcional.

---

## Fallas Identificadas

### Críticas (actuar ya)

1. **`.env.local` en git** — Todas las credenciales expuestas: Supabase keys, R2 secret, Gmail password, CRON secret. Rotar todos los tokens inmediatamente y agregar `.env*.local` al `.gitignore`.

2. **Sin autenticación en rutas API** — `/api/inventory/[id]/image` y `/api/requisitions/update-status` no validan sesión del usuario. Cualquiera puede hacer requests directos.

3. **Sin rate limiting** — Login, endpoints de admin, y upload de imágenes sin protección contra abuso.

### Medias (deuda técnica)

4. **Lógica duplicada en Dashboard** — El procesamiento de gráficas (timeline, products map, category map, area map) está duplicado entre la carga inicial y el handler de realtime (~150 líneas idénticas). Extraer a una función helper.

5. **~80 usos de `any`** — Se pierde type safety en varios componentes. Patrón `as unknown as X` usado para evadir el compilador.

6. **Mensajes de error crudos al usuario** — `toast.error('Error: ' + error.message)` expone detalles internos de la base de datos.

7. **Sin Error Boundaries de React** — Si un componente falla, toda la página se rompe sin feedback controlado.

8. **Validación de formularios inconsistente** — Algunos formularios validan, otros no. Sin librería compartida (Zod, Yup).

9. **Componentes muy grandes** — Dashboard: 788 líneas, Productos: 403 líneas. Difícil de mantener.

10. **Sin TypeScript strict mode** en `tsconfig.json`.

---

## Puntos de Mejora

### Performance

- **Dashboard**: múltiples queries agregadas al cargar + subscripciones realtime que refetchean todo. Considerar vistas materializadas en Supabase para métricas del dashboard.
- **Inventario**: calcula `avg_consumption` para todos los items en cada carga. Cachear o mover a la DB.
- Las subscripciones realtime disparan refetch completo ante cualquier cambio (no incremental).

### UX

- Los estados de carga son inconsistentes: algunas páginas tienen skeleton, otras spinner, otras nada.
- `confirm()` nativo del browser para eliminar registros — inconsistente con el diseño.
- Sin advertencia de presupuesto **antes** de guardar una requisición (solo se detecta post-save).
- No hay notificación al solicitante cuando su requisición es aprobada/rechazada.
- Sin UI clara para que ADMIN apruebe requisiciones pendientes (flujo incompleto).

### Código

- Magic strings de status (`'PENDIENTE'`, `'ENTREGADA'`, etc.) repetidos en toda la app → centralizar en un archivo de constantes.
- Sin tests (ni unitarios ni de integración).

---

## Ideas de Nuevas Funcionalidades

### Alta prioridad (valor inmediato)

| Feature | Descripción |
|---|---|
| **Generación de PDF** | Órdenes de compra y requisiciones en PDF para imprimir/enviar a proveedores |
| **CRUD de Proveedores** | La tabla `suppliers` existe pero no hay página de gestión dedicada |
| **Importación masiva desde Excel** | Ya tienen export; el import completaría el ciclo para carga inicial de inventario |
| **Flujo de aprobación explícito** | Panel para ADMIN con lista de requisiciones pendientes de aprobación + botón aprobar/rechazar + notificación al solicitante |
| **Presupuesto: aviso previo** | Mostrar en tiempo real el presupuesto disponible del área mientras se crea una requisición |

### Media prioridad

| Feature | Descripción |
|---|---|
| **Pronóstico de demanda** | Con los 12 meses de historial: calcular consumo promedio y proyectar punto de reorden automático |
| **Comparativa de proveedores** | Historial de precios por producto × proveedor para elegir la mejor cotización |
| **Conteo físico / Inventario cíclico** | Página de conteo ya iniciada; completar con diff visual (contado vs sistema) y ajuste masivo |
| **Escaneo de código de barras** | Via cámara del teléfono (API `BarcodeDetector` o librería `zxing`) para agilizar entradas/salidas |
| **Historial de precios** | Al recibir una OC, guardar precio histórico del producto para análisis de inflación |
| **Dashboard por área** | Vista filtrada para jefes de área: solo sus requisiciones, consumo y presupuesto |

### Largo plazo

| Feature | Descripción |
|---|---|
| **Alertas inteligentes** | Stock bajo + tendencia de consumo → sugerir OC automáticamente con cantidad calculada |
| **Multi-empresa** | Aislamiento de datos por tenant (ya en roadmap Fase 4) |
| **PWA offline** | Service worker para registrar movimientos sin internet y sincronizar al reconectar |
| **Webhooks / integración ERP** | Eventos configurables para sincronizar con sistemas externos |
| **Módulo de cotizaciones** | Enviar solicitud de cotización a múltiples proveedores y comparar respuestas |

---

## Resumen de Prioridades

| Urgencia | Acciones |
|---|---|
| **Inmediato** | Rotar credenciales + validar APIs + rate limiting |
| **Próximas semanas** | Extraer lógica duplicada, TypeScript strict, Error Boundaries, validación con Zod |
| **Próximo sprint** | PDF export, CRUD proveedores, flujo aprobación completo, aviso presupuesto en tiempo real |
