# Fintrack — Tasks

> Versión 1.0 | Febrero 2026
> Metodología: Spec-driven con Claude Code
> Referencia: PRODUCT_BRIEF.md + ARCHITECTURE.md

---

## Cómo usar este archivo

- Las tareas están ordenadas por dependencia estricta: no empezar una tarea si sus dependencias no están marcadas como completadas.
- Cada tarea es **atómica**: un solo contexto de Claude Code por tarea.
- Al iniciar una tarea con Claude Code, incluir siempre: este archivo + ARCHITECTURE.md como contexto.
- Marcar como `[x]` al completar.

---

## FASE 1 — Backend (Supabase)

### 1.1 Setup inicial de Supabase

- [x] **TASK-001** — Crear proyecto en Supabase
  - Crear proyecto nuevo en supabase.com
  - Guardar: Project URL, anon key, service role key
  - Habilitar extensiones: `uuid-ossp`, `pgcrypto`
  - _Dependencias: ninguna_

- [x] **TASK-002** — Ejecutar migration inicial
  - Crear archivo `supabase/migrations/001_initial_schema.sql`
  - Incluir schema completo de ARCHITECTURE.md sección 2.1
  - Tablas: `gmail_tokens`, `transactions`, `budgets`, `alerts`, `poller_state`
  - Incluir índices y constraints
  - Ejecutar via Supabase CLI: `supabase db push`
  - _Dependencias: TASK-001_

- [x] **TASK-003** — Configurar Row Level Security
  - Aplicar políticas RLS de ARCHITECTURE.md sección 2.2
  - Verificar que un usuario no pueda acceder a datos de otro
  - _Dependencias: TASK-002_

- [x] **TASK-004** — Crear función RPC `get_monthly_summary`
  - Implementar función SQL de ARCHITECTURE.md sección 4.4
  - Testear via Supabase SQL Editor con datos de prueba
  - _Dependencias: TASK-002_

---

### 1.2 Autenticación Google OAuth

- [x] **TASK-005** — Configurar Google Cloud Console
  - Crear proyecto en console.cloud.google.com
  - Habilitar Gmail API
  - Crear OAuth 2.0 credentials (Web application)
  - Agregar redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
  - Scope requerido: `https://www.googleapis.com/auth/gmail.readonly`
  - Guardar Client ID y Client Secret
  - _Dependencias: TASK-001_

- [x] **TASK-006** — Configurar Google OAuth en Supabase
  - Supabase Dashboard → Auth → Providers → Google: ON
  - Ingresar Client ID y Client Secret de TASK-005
  - Verificar redirect URL configurada
  - _Dependencias: TASK-005_

---

### 1.3 Edge Functions

- [ ] **TASK-007** — Setup Supabase CLI y estructura de functions
  - Instalar Supabase CLI: `npm install -g supabase`
  - Inicializar: `supabase init`
  - Crear estructura de carpetas:
    ```
    supabase/functions/gmail-poller/index.ts
    supabase/functions/email-parser/index.ts
    supabase/functions/alert-evaluator/index.ts
    ```
  - Configurar secrets en Supabase Dashboard:
    `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
  - _Dependencias: TASK-001_

- [ ] **TASK-008** — Implementar `email-parser`: parser Produbanco
  - Implementar regex de ARCHITECTURE.md sección 3.4 para Produbanco
  - Incluir normalización de fecha en español (MONTH_MAP)
  - Incluir lógica de categorización de ARCHITECTURE.md sección 3.5
  - Incluir cálculo de `raw_hash` para deduplicación
  - INSERT con `ON CONFLICT (raw_hash) DO NOTHING`
  - Test unitario con body de email real de Produbanco
  - _Dependencias: TASK-007, TASK-003_

- [ ] **TASK-009** — Implementar `email-parser`: parser DeUna
  - Implementar regex de ARCHITECTURE.md sección 3.4 para DeUna
  - Reutilizar lógica de categorización de TASK-008
  - Reutilizar lógica de deduplicación de TASK-008
  - Test unitario con body de email real de DeUna
  - _Dependencias: TASK-008_

- [ ] **TASK-010** — Implementar `email-parser`: parser Transferencias
  - Implementar regex de ARCHITECTURE.md sección 3.4 para Transferencias
  - `source = 'transfer'`, `category = null` por defecto
  - Test unitario con body de email real de transferencia
  - _Dependencias: TASK-008_

- [ ] **TASK-011** — Implementar `alert-evaluator`
  - Implementar lógica SQL de ARCHITECTURE.md sección 3.3
  - Evaluar umbrales: `budget_80`, `budget_exceeded`, `unusual_spend`
  - INSERT en `alerts` solo si no existe alerta del mismo tipo en las últimas 24h (evitar spam)
  - _Dependencias: TASK-008, TASK-003_

- [ ] **TASK-012** — Implementar `gmail-poller`
  - Implementar lógica de ARCHITECTURE.md sección 3.1
  - Leer todos los usuarios de `gmail_tokens`
  - Refresh de access_token cuando `expires_at < NOW() + 5min`
  - Usar Gmail History API para polling incremental
  - Filtrar por FROM: `notificaciones@produbanco.com`, `notificaciones@deuna.com`
  - Llamar `email-parser` para cada mensaje nuevo
  - Actualizar `poller_state.last_history_id`
  - Manejo de errores: token revocado, rate limit 429
  - _Dependencias: TASK-009, TASK-010, TASK-006_

- [ ] **TASK-013** — Configurar cron para `gmail-poller`
  - Configurar `pg_cron` en Supabase para ejecutar `gmail-poller` cada 5 minutos
  - Verificar ejecución en Supabase Dashboard → Edge Functions → Logs
  - _Dependencias: TASK-012_

---

## FASE 2 — App React Native: Setup

- [x] **TASK-014** — Inicializar proyecto Expo
  - `npx create-expo-app@latest fintrack --template tabs`
  - Verificar que instala SDK 54 (React Native 0.81, React 19.1)
  - Configurar TypeScript estricto (`tsconfig.json`)
  - Instalar dependencias base:
    ```
    @supabase/supabase-js
    expo-router
    @nozbe/watermelondb
    react-native-safe-area-context
    react-native-screens
    ```
  - Crear archivo `.env` con variables de ARCHITECTURE.md sección 8
  - _Dependencias: TASK-001_

- [x] **TASK-015** — Configurar Supabase JS SDK
  - Crear `lib/supabase.ts` con cliente configurado
  - Configurar `AsyncStorage` como storage para la sesión
  - Exportar cliente tipado
  - _Dependencias: TASK-014_

- [x] **TASK-016** — Configurar WatermelonDB
  - Crear `db/schema.ts` con modelos locales para `Transaction`, `Budget`, `Alert`
  - Crear `db/models/Transaction.ts`, `Budget.ts`, `Alert.ts`
  - Crear `db/index.ts` con instancia de la DB
  - _Dependencias: TASK-014_

- [x] **TASK-017** — Configurar Expo Router: tab bar y navegación base
  - Crear `app/(auth)/login.tsx` (pantalla vacía placeholder)
  - Crear `app/(tabs)/_layout.tsx` con 3 tabs: Dashboard, Transacciones, Ajustes
  - Crear `app/(tabs)/index.tsx`, `transactions.tsx`, `settings.tsx` (placeholders)
  - Crear `app/transaction/[id].tsx` y `app/transaction/add.tsx` (placeholders)
  - Verificar navegación funciona en simulador
  - _Dependencias: TASK-014_

---

## FASE 3 — App React Native: Autenticación

- [x] **TASK-018** — Pantalla de Login con Google OAuth
  - Implementar `app/(auth)/login.tsx`
  - Botón "Conectar con Gmail"
  - Llamar `supabase.auth.signInWithOAuth({ provider: 'google' })`
  - Con scope `gmail.readonly`
  - _Dependencias: TASK-015, TASK-017, TASK-006_

- [x] **TASK-019** — Manejo de sesión y redirect post-login
  - Detectar sesión activa al abrir la app
  - Si hay sesión → redirigir a `(tabs)`
  - Si no hay sesión → redirigir a `(auth)/login`
  - Implementar logout desde Ajustes
  - _Dependencias: TASK-018_

---

## FASE 4 — App React Native: Pantallas principales

- [x] **TASK-020** — Pantalla Dashboard
  - Llamar RPC `get_monthly_summary` para mes actual
  - Mostrar total gastado del mes
  - Mostrar barra de progreso vs presupuesto total
  - Mostrar breakdown por categoría (lista con porcentajes)
  - Mostrar últimas 5 transacciones
  - Suscribirse a Supabase Realtime para actualización automática
  - _Dependencias: TASK-015, TASK-016, TASK-019, TASK-004_

- [x] **TASK-021** — Pantalla Transacciones: lista
  - Cargar transacciones desde WatermelonDB (offline-first)
  - Sync con Supabase al montar
  - Filtros por fuente y categoría (chips horizontales)
  - Agrupación por fecha (secciones: Hoy, Ayer, fecha)
  - Componente `TransactionCard.tsx` con ícono de categoría, comercio, monto, fuente
  - Botón ➕ en header → navegar a `transaction/add`
  - Al tocar card → navegar a `transaction/[id]`
  - _Dependencias: TASK-016, TASK-019_

- [ ] **TASK-022** — Modal Detalle de Transacción (`transaction/[id]`)
  - Mostrar todos los campos de la transacción
  - Selector editable de categoría (picker con íconos)
  - Campo editable de nota
  - Botón guardar → PATCH en Supabase + actualizar WatermelonDB local
  - _Dependencias: TASK-021_

- [ ] **TASK-023** — Modal Gasto Manual (`transaction/add`)
  - Teclado numérico custom para monto
  - Campos: comercio (texto), categoría (picker), fecha (date picker), fuente (siempre 'manual')
  - POST a Supabase → INSERT en WatermelonDB local
  - Cerrar modal y refrescar lista de transacciones
  - _Dependencias: TASK-021_

- [ ] **TASK-024** — Pantalla Ajustes: estructura y secciones
  - Sección **Cuenta**: email del usuario, botón logout
  - Sección **Conexión Gmail**: estado (conectado / desconectado), botón reconectar
  - Sección **Presupuestos**: lista de presupuestos por categoría con botón editar
  - Sección **Alertas**: lista de alertas recientes, marcar como leída
  - Sección **Exportar**: botones Exportar CSV y Exportar Excel con selector de rango
  - _Dependencias: TASK-019_

- [ ] **TASK-025** — Ajustes: Presupuestos por categoría
  - Listar presupuestos del mes actual desde Supabase
  - Formulario inline para crear / editar presupuesto por categoría
  - POST/PATCH con `Prefer: resolution=merge-duplicates`
  - _Dependencias: TASK-024_

---

## FASE 5 — Features completos

- [ ] **TASK-026** — Alertas: listado y marcar como leída
  - Cargar alertas no leídas desde Supabase
  - Componente `AlertCard.tsx` con tipo, categoría, fecha
  - PATCH `is_read = true` al tocar
  - Badge numérico en tab Ajustes si hay alertas no leídas
  - _Dependencias: TASK-024, TASK-011_

- [ ] **TASK-027** — Push notifications locales
  - Configurar `expo-notifications`
  - Al recibir nueva alerta via Realtime → disparar notificación local
  - Solicitar permisos en onboarding post-login
  - _Dependencias: TASK-026_

- [ ] **TASK-028** — Sync completo Supabase ↔ WatermelonDB
  - Implementar `lib/sync.ts` con estrategia upsert completa
  - Sync inicial al login: cargar últimos 3 meses de transacciones
  - Sync incremental via Realtime (INSERT/UPDATE/DELETE)
  - Manejo de conflictos: Supabase gana siempre (source of truth)
  - _Dependencias: TASK-016, TASK-015_

- [ ] **TASK-029** — Exportación CSV
  - Implementar `lib/export.ts` función `exportCSV(range)`
  - Query a WatermelonDB local por rango de fechas
  - Generar string CSV con columnas: fecha, fuente, comercio, monto, categoría, notas
  - Compartir via `expo-sharing`
  - _Dependencias: TASK-024_

- [ ] **TASK-030** — Exportación Excel
  - Usar SheetJS (`xlsx`) para generar archivo `.xlsx`
  - Hoja 1: transacciones con formato de tabla
  - Hoja 2: resumen por categoría (SUM agrupado)
  - Compartir via `expo-sharing`
  - _Dependencias: TASK-029_

---

## FASE 6 — Pulido y publicación

- [ ] **TASK-031** — Gráfica mensual en Dashboard
  - Implementar `MonthlyChart.tsx` con Victory Native
  - Gráfica de barras: gasto por categoría del mes actual
  - Comparación con mes anterior (línea secundaria)
  - _Dependencias: TASK-020_

- [ ] **TASK-032** — Estados vacíos y loading
  - Skeleton loaders en Dashboard y lista de Transacciones
  - Empty state en Transacciones cuando no hay datos
  - Empty state en Alertas
  - Error state con botón de retry en caso de fallo de red
  - _Dependencias: TASK-020, TASK-021_

- [ ] **TASK-033** — Onboarding flow
  - Pantalla de bienvenida antes del login
  - Explicar permisos de Gmail (por qué se pide `gmail.readonly`)
  - Mostrar solo en primer launch (guardar flag en AsyncStorage)
  - _Dependencias: TASK-019_

- [ ] **TASK-034** — Testing en dispositivos físicos
  - Probar OAuth flow completo en iPhone físico
  - Probar OAuth flow completo en Android físico
  - Verificar push notifications en ambas plataformas
  - Verificar exportación CSV/Excel abre correctamente
  - _Dependencias: todas las anteriores_

- [ ] **TASK-035** — Build de producción y publicación
  - Configurar `app.json` con bundle ID, versión, íconos, splash screen
  - Build iOS: `eas build --platform ios`
  - Build Android: `eas build --platform android`
  - Subir a App Store Connect
  - Subir a Google Play Console
  - _Dependencias: TASK-034_

---

## Resumen de dependencias críticas

```
TASK-001 (Supabase setup)
  └── TASK-002 (Schema)
        └── TASK-003 (RLS)
              └── TASK-008 (Parser Produbanco)
                    ├── TASK-009 (Parser DeUna)
                    ├── TASK-010 (Parser Transferencias)
                    └── TASK-011 (Alert evaluator)
                          └── TASK-012 (Gmail poller)
                                └── TASK-013 (Cron)

TASK-014 (Expo init)
  ├── TASK-015 (Supabase SDK)
  ├── TASK-016 (WatermelonDB)
  └── TASK-017 (Navegación base)
        └── TASK-018 (Login OAuth)
              └── TASK-019 (Sesión)
                    ├── TASK-020 (Dashboard)
                    ├── TASK-021 (Transacciones)
                    │     ├── TASK-022 (Detalle)
                    │     └── TASK-023 (Gasto manual)
                    └── TASK-024 (Ajustes)
                          ├── TASK-025 (Presupuestos)
                          ├── TASK-026 (Alertas)
                          ├── TASK-029 (Export CSV)
                          └── TASK-030 (Export Excel)
```

---

_Actualizar este archivo al completar cada tarea. No modificar el orden sin revisar el árbol de dependencias._
