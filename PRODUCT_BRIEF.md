# Fintrack — Product Brief
> Versión 1.1 | Febrero 2026

---

## 1. Visión del Producto

Fintrack es una aplicación de finanzas personales que **captura automáticamente los gastos** desde correos bancarios (Produbanco, DeUna) y transferencias, los categoriza con inteligencia, y los presenta en un dashboard claro con alertas de presupuesto.

El proyecto tiene dos objetivos paralelos:
1. **Uso personal:** registrar gastos automáticamente sin fricción.
2. **Portafolio profesional:** aplicación cross-platform en React Native (iOS + Android) sobre un backend Supabase compartido, demostrando dominio de arquitectura móvil moderna y desarrollo full-stack.

---

## 2. Problema que Resuelve

Los bancos ecuatorianos como Produbanco y DeUna envían notificaciones de gasto por email. Hoy no existe una forma confiable de capturar esos datos automáticamente en un iPhone porque:

- **iOS Shortcuts** no ejecuta automatizaciones cuando el teléfono está bloqueado con pantalla apagada (confirmado en iOS 18).
- Las apps bancarias locales no tienen API ni exportación de datos.
- Las soluciones manuales (Excel, apps genéricas) tienen demasiada fricción para uso consistente.

---

## 3. Solución

Un sistema de **ingesta server-side** que procesa los correos bancarios 24/7 independientemente del estado del dispositivo, sincroniza los datos a todos los dispositivos del usuario vía Supabase, y los presenta en una app React Native que corre en iOS y Android.

### Flujo de ingesta end-to-end

```
Usuario autoriza Gmail via OAuth
            ↓
Supabase Edge Function (polling Gmail API)
  • Detecta correos de Produbanco / DeUna
  • Parsing con regex (monto, comercio, fecha, fuente)
  • Deduplicación por hash(fecha + monto + comercio)
  • Categorización automática por reglas de keywords
  • INSERT en PostgreSQL
            ↓
PostgreSQL en Supabase (fuente de verdad)
            ↓
App React Native + Expo
  • iOS y Android desde una sola codebase
  • Cache local con WatermelonDB
  • Sync en tiempo real vía Supabase Realtime
```

---

## 4. Fuentes de Datos

| Fuente | Método de ingesta | Formato |
|---|---|---|
| Produbanco | Gmail API via OAuth | Email estructurado con regex |
| DeUna / pagos QR | Gmail API via OAuth | Email estructurado con regex |
| Transferencias bancarias | Gmail API via OAuth | Email estructurado con regex |
| Gastos manuales | Entrada directa en app | Formulario in-app |

---

## 5. Stack Técnico

### Backend

| Componente | Tecnología | Costo |
|---|---|---|
| Base de datos | Supabase (PostgreSQL) | Gratis |
| Edge Functions | Supabase Edge Functions (Deno) | Gratis |
| Auth / OAuth Gmail | Supabase Auth + Google OAuth 2.0 | Gratis |
| Email ingesta | Gmail API (polling desde Edge Function) | Gratis |
| Dominio | Cloudflare Registrar | ~$10/año |

### Cliente — React Native (iOS + Android)

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | React Native + Expo (SDK 54) | Managed workflow |
| Lenguaje | TypeScript | Tipado estricto |
| Navegación | Expo Router (file-based) | |
| Storage local | WatermelonDB | Cache offline-first |
| Sync / Backend | Supabase JS SDK + Realtime | |
| Auth | Supabase Auth + Google OAuth | |
| Gráficas | Victory Native | |
| Notificaciones | Expo Notifications | Push en iOS y Android |
| Exportación | expo-sharing + SheetJS | CSV y Excel |
| Nativo (si se requiere) | Expo Modules / bare workflow | Solo si hay funcionalidad sin soporte en Expo managed |

---

## 6. Modelo de Datos

```sql
-- Transacciones
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  date         TIMESTAMPTZ NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  merchant     TEXT NOT NULL,
  source       TEXT NOT NULL,        -- 'produbanco' | 'deuna' | 'transfer' | 'manual'
  category     TEXT,                 -- 'food' | 'transport' | 'shopping' | 'other'
  notes        TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  raw_hash     TEXT UNIQUE,          -- hash para deduplicación
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Presupuestos
CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  month        INT NOT NULL,
  year         INT NOT NULL,
  category     TEXT NOT NULL,
  limit_amount DECIMAL(10,2) NOT NULL
);

-- Alertas
CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  triggered_at   TIMESTAMPTZ DEFAULT NOW(),
  type           TEXT NOT NULL,      -- 'budget_exceeded' | 'unusual_spend'
  transaction_id UUID REFERENCES transactions,
  is_read        BOOLEAN DEFAULT FALSE
);
```

---

## 7. Pantallas de la App

### Tab Bar: 3 tabs principales

| Tab | Pantalla | Descripción |
|---|---|---|
| 🏠 | Dashboard | Resumen mensual, barra de progreso de presupuesto, gastos por categoría, últimas transacciones |
| 📊 | Transacciones | Lista completa con filtros por fuente y categoría. Botón ➕ en header para agregar gasto manual |
| ⚙️ | Ajustes | Presupuestos por categoría, sección de Alertas, fuentes conectadas, exportar CSV/Excel, estado de sync |

### Modales sobre tabs

**Gasto Manual** — Modal accesible desde el botón ➕ en Transacciones. Teclado numérico, campos de comercio, categoría, fecha y fuente.

**Detalle de Transacción** — Modal/bottom sheet al tocar cualquier transacción. Muestra fecha, fuente, monto, comercio, selector de categoría editable, campo de nota, y acceso al email original almacenado en Supabase.

---

## 8. Reglas de Categorización Automática

```
merchant contiene: SUPERMAXI, KFC, McDONALD, RESTAUR, SUSHI  → Comida
merchant contiene: ESTACION, PETROECUADOR, PETRO, GAS, UBER  → Transporte
merchant contiene: FARMACIA, FYBECA, MEDIC, CLINICA           → Salud
merchant contiene: NETFLIX, SPOTIFY, STEAM, APPLE            → Entretenimiento
merchant contiene: AMAZON, ZARA, H&M, AKI, MEGAMAXI          → Compras
sin match                                                     → Sin categoría (requiere revisión)
```

---

## 9. Alertas

| Tipo | Condición | Canal |
|---|---|---|
| Límite casi alcanzado | Gasto en categoría ≥ 80% del presupuesto | Push notification |
| Límite superado | Gasto en categoría ≥ 100% del presupuesto | Push notification |
| Gasto inusual | Gasto semanal ≥ 140% del promedio de las últimas 4 semanas | Push notification |

---

## 10. Exportación

- **CSV:** todas las transacciones del rango seleccionado, columnas: fecha, fuente, comercio, monto, categoría, notas.
- **Excel:** mismo contenido con formato de tabla, hoja adicional con resumen por categoría.
- Rango seleccionable: mes actual, mes anterior, últimos 3 meses, rango personalizado.

---

## 11. Costos Totales del Proyecto

| Componente | Costo |
|---|---|
| Dominio (Cloudflare) | ~$10/año |
| Supabase | $0 (tier gratuito) |
| Gmail API | $0 |
| Expo (managed workflow) | $0 |
| **Total** | **~$10/año** |

---

## 12. Estimación de Storage

| Período | Transacciones (~15/día) | Storage en Supabase |
|---|---|---|
| 1 mes | ~450 | ~450 KB |
| 1 año | ~5,400 | ~5 MB |
| 5 años | ~27,000 | ~27 MB |

El raw email se almacena solo en Supabase (PostgreSQL). El cache local en WatermelonDB contiene únicamente los datos parseados para mantener el storage del dispositivo mínimo.

---

## 13. Roadmap de Desarrollo

### Fase 1 — Backend (semanas 1–2)
- [ ] Setup Supabase: schema, RLS policies, Auth
- [ ] Google OAuth 2.0 flow en Supabase
- [ ] Edge Function: polling Gmail API + parser Produbanco
- [ ] Edge Function: parser DeUna
- [ ] Edge Function: parser Transferencias
- [ ] Reglas de categorización automática
- [ ] Sistema de alertas (evaluación de presupuesto post-insert)

### Fase 2 — App React Native MVP (semanas 3–5)
- [ ] Setup Expo + TypeScript + Expo Router
- [ ] Integración Supabase JS SDK + WatermelonDB
- [ ] Google OAuth flow en la app
- [ ] Dashboard
- [ ] Pantalla de Transacciones + Detalle
- [ ] Gasto Manual

### Fase 3 — Features completos (semanas 6–7)
- [ ] Presupuestos por categoría
- [ ] Pantalla de Alertas + push notifications
- [ ] Exportación CSV y Excel
- [ ] Pantalla de Configuración

### Fase 4 — Pulido y publicación (semana 8)
- [ ] Testing en iOS y Android
- [ ] App Store submission (iOS)
- [ ] Google Play submission (Android)

---

## 14. Decisiones de Arquitectura Registradas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| React Native + Expo sobre Swift nativo | SwiftUI / Swift 6 | Una sola codebase para iOS y Android; mejor ROI para portafolio cross-platform |
| React Native + Expo sobre Kotlin nativo | Jetpack Compose | Misma razón; nativo se considera solo si Expo no cubre alguna funcionalidad específica |
| Supabase sobre Firebase | Firebase Firestore | PostgreSQL es superior para queries analíticas financieras; pricing más predecible |
| Gmail API OAuth sobre email forwarding | Auto-forward + Postmark | Más limpio, elimina paso manual del usuario, demuestra OAuth flow real en portafolio |
| Backend server-side sobre iOS Shortcuts | Shortcuts automations | Shortcuts no ejecuta en background con pantalla bloqueada en iOS 18 (bug documentado) |
| WatermelonDB sobre AsyncStorage | AsyncStorage / MMKV | WatermelonDB soporta queries relacionales offline, necesario para filtros y agrupaciones |
| Expo managed workflow | Bare workflow | Menor fricción para CI/CD y publicación; se migra a bare solo si se requiere módulo nativo sin soporte |

---

*Este documento es la fuente de verdad del proyecto. Toda decisión técnica posterior debe referenciarse aquí.*
