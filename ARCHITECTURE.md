# Fintrack — Architecture
> Versión 1.0 | Febrero 2026

---

## 1. Visión General

Fintrack sigue una arquitectura **client-server** donde el backend en Supabase es la fuente de verdad y el cliente React Native mantiene un cache local sincronizado. Todo el procesamiento de datos (parsing, categorización, alertas) ocurre en el servidor, nunca en el cliente.

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENTE                          │
│                                                         │
│   React Native + Expo (iOS / Android)                   │
│   ├── Expo Router (navegación)                          │
│   ├── WatermelonDB (cache local, offline-first)         │
│   └── Supabase JS SDK (auth + sync + realtime)          │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS / Realtime WebSocket
┌────────────────────▼────────────────────────────────────┐
│                       BACKEND                           │
│                                                         │
│   Supabase                                              │
│   ├── Auth (Google OAuth 2.0)                           │
│   ├── PostgreSQL (fuente de verdad)                     │
│   ├── Row Level Security (RLS)                          │
│   ├── Edge Functions (Deno)                             │
│   │   ├── gmail-poller     (cron cada 5 min)            │
│   │   ├── email-parser     (parsing + categorización)   │
│   │   └── alert-evaluator  (evalúa presupuestos)        │
│   └── Realtime (push de cambios al cliente)             │
└────────────────────┬────────────────────────────────────┘
                     │ Gmail API (OAuth 2.0)
┌────────────────────▼────────────────────────────────────┐
│                    SERVICIOS EXTERNOS                   │
│                                                         │
│   Gmail API (Google Cloud)                              │
│   └── Scopes: gmail.readonly                            │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Base de Datos (PostgreSQL)

### 2.1 Schema completo

```sql
-- ─────────────────────────────────────────
-- EXTENSIONES
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- TABLA: gmail_tokens
-- Almacena los tokens OAuth de Gmail por usuario
-- ─────────────────────────────────────────
CREATE TABLE gmail_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL UNIQUE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- TABLA: transactions
-- ─────────────────────────────────────────
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  date         TIMESTAMPTZ NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  merchant     TEXT NOT NULL,
  source       TEXT NOT NULL
                 CHECK (source IN ('produbanco', 'deuna', 'transfer', 'manual')),
  category     TEXT
                 CHECK (category IN (
                   'food', 'transport', 'health',
                   'entertainment', 'shopping', 'other', NULL
                 )),
  notes        TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  raw_hash     TEXT UNIQUE,   -- SHA256(date + amount + merchant + user_id)
  raw_email_id TEXT,          -- Gmail message ID, para trazabilidad
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_date
  ON transactions(user_id, date DESC);

CREATE INDEX idx_transactions_user_category
  ON transactions(user_id, category);

-- ─────────────────────────────────────────
-- TABLA: budgets
-- ─────────────────────────────────────────
CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  month        INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INT NOT NULL CHECK (year >= 2024),
  category     TEXT NOT NULL,
  limit_amount DECIMAL(10,2) NOT NULL CHECK (limit_amount > 0),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, month, year, category)
);

-- ─────────────────────────────────────────
-- TABLA: alerts
-- ─────────────────────────────────────────
CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  triggered_at   TIMESTAMPTZ DEFAULT NOW(),
  type           TEXT NOT NULL
                   CHECK (type IN ('budget_80', 'budget_exceeded', 'unusual_spend')),
  category       TEXT,
  transaction_id UUID REFERENCES transactions ON DELETE SET NULL,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_unread
  ON alerts(user_id, is_read);

-- ─────────────────────────────────────────
-- TABLA: poller_state
-- Registra el último email procesado por usuario
-- para que el poller no reprocese emails
-- ─────────────────────────────────────────
CREATE TABLE poller_state (
  user_id          UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  last_history_id  TEXT,   -- Gmail historyId para polling incremental
  last_polled_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 Row Level Security (RLS)

Todo usuario solo puede ver y modificar sus propios datos.

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE poller_state    ENABLE ROW LEVEL SECURITY;

-- Políticas: el usuario solo accede a sus propias filas
CREATE POLICY "users_own_transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_budgets"
  ON budgets FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_alerts"
  ON alerts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_gmail_tokens"
  ON gmail_tokens FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_poller_state"
  ON poller_state FOR ALL
  USING (auth.uid() = user_id);
```

---

## 3. Edge Functions (Deno)

### 3.1 `gmail-poller` — Cron cada 5 minutos

**Responsabilidad:** iterar sobre todos los usuarios con Gmail conectado y llamar al parser para cada email nuevo.

**Trigger:** Supabase Cron (`pg_cron`) cada 5 minutos.

```
gmail-poller
  ↓
  Para cada usuario en gmail_tokens:
    1. Refrescar access_token si expires_at < NOW() + 5min
    2. Llamar Gmail API: GET /gmail/v1/users/me/history
       con startHistoryId = poller_state.last_history_id
    3. Filtrar mensajes donde FROM contiene:
       - notificaciones@produbanco.com
       - notificaciones@deuna.com
    4. Para cada messageId nuevo:
       → llamar email-parser(userId, messageId)
    5. Actualizar poller_state.last_history_id
```

**Manejo de errores:**
- Si el refresh token falla (revocado por el usuario) → marcar gmail_tokens como inválido, no reintentar hasta reconexión.
- Si Gmail API devuelve 429 → esperar con exponential backoff.

---

### 3.2 `email-parser` — Invocado por gmail-poller

**Responsabilidad:** obtener el cuerpo del email, extraer los datos con regex, categorizar y guardar en `transactions`.

**Input:**
```typescript
{
  userId: string,
  messageId: string  // Gmail message ID
}
```

**Flujo interno:**

```
1. GET /gmail/v1/users/me/messages/{messageId}
   → obtener body (text/plain decodificado de base64)

2. Detectar fuente por FROM:
   - notificaciones@produbanco.com → parser_produbanco()
   - notificaciones@deuna.com      → parser_deuna()

3. Extraer campos con regex (ver sección 3.4)

4. Calcular raw_hash:
   SHA256(date.toISOString() + amount + merchant + userId)

5. INSERT INTO transactions ... ON CONFLICT (raw_hash) DO NOTHING
   (deduplicación automática)

6. Si INSERT exitoso → llamar alert-evaluator(userId, transactionId)
```

---

### 3.3 `alert-evaluator` — Invocado post-insert

**Responsabilidad:** verificar si la nueva transacción dispara alguna alerta de presupuesto o gasto inusual.

**Input:**
```typescript
{
  userId: string,
  transactionId: string
}
```

**Lógica:**

```sql
-- 1. Obtener gasto acumulado en la categoría del mes actual
SELECT SUM(amount) as total
FROM transactions
WHERE user_id = $userId
  AND category = $category
  AND date_trunc('month', date) = date_trunc('month', NOW());

-- 2. Obtener presupuesto definido para esa categoría y mes
SELECT limit_amount FROM budgets
WHERE user_id = $userId
  AND category = $category
  AND month = EXTRACT(MONTH FROM NOW())
  AND year  = EXTRACT(YEAR  FROM NOW());

-- 3. Evaluar umbrales
IF total >= limit_amount       → INSERT alert type='budget_exceeded'
IF total >= limit_amount * 0.8 → INSERT alert type='budget_80'

-- 4. Gasto inusual: comparar semana actual vs promedio 4 semanas prev.
WITH weekly AS (
  SELECT SUM(amount) as week_total
  FROM transactions
  WHERE user_id = $userId
    AND date >= NOW() - INTERVAL '4 weeks'
  GROUP BY date_trunc('week', date)
)
→ IF semana_actual >= AVG(semanas_previas) * 1.4
  → INSERT alert type='unusual_spend'
```

---

### 3.4 Regex de Parsing por Fuente

#### Produbanco

Email de ejemplo:
```
Consumo Tarjeta de Crédito
Valor: USD 28.89
Establecimiento: ESTACION DE SERVICI
Fecha: 22/Febrero/2026
Hora: 16:41
```

```typescript
const PRODUBANCO_REGEXES = {
  amount:   /Valor:\s*USD\s*([0-9]+(?:\.[0-9]{2})?)/,
  merchant: /Establecimiento:\s*([^\r\n]+)/,
  date:     /Fecha:\s*(\d{2}\/\w+\/\d{4})/,
  time:     /Hora:\s*(\d{2}:\d{2})/,
};

// Normalización de fecha en español
const MONTH_MAP: Record<string, string> = {
  Enero: '01', Febrero: '02', Marzo: '03', Abril: '04',
  Mayo: '05', Junio: '06', Julio: '07', Agosto: '08',
  Septiembre: '09', Octubre: '10', Noviembre: '11', Diciembre: '12',
};
// "22/Febrero/2026" + "16:41" → "2026-02-22T16:41:00-05:00"
```

#### DeUna

Email de ejemplo:
```
Pago QR realizado
Monto: $12.00
Comercio: TIENDA LA FAVORITA
Fecha y hora: 2026-02-22 14:30
```

```typescript
const DEUNA_REGEXES = {
  amount:   /Monto:\s*\$([0-9]+(?:\.[0-9]{2})?)/,
  merchant: /Comercio:\s*([^\r\n]+)/,
  datetime: /Fecha y hora:\s*(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})/,
};
// datetime ya viene en ISO-like, parseo directo
```

#### Transferencias (Produbanco)

```typescript
const TRANSFER_REGEXES = {
  amount:      /Valor:\s*USD\s*([0-9]+(?:\.[0-9]{2})?)/,
  destination: /Beneficiario:\s*([^\r\n]+)/,
  date:        /Fecha:\s*(\d{2}\/\w+\/\d{4})/,
  time:        /Hora:\s*(\d{2}:\d{2})/,
};
```

---

### 3.5 Reglas de Categorización Automática

```typescript
const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  {
    category: 'food',
    keywords: ['SUPERMAXI', 'KFC', 'MCDONALD', 'RESTAUR', 'SUSHI',
               'PIZZA', 'BURGER', 'COMIDA', 'CAFE', 'BAKERY'],
  },
  {
    category: 'transport',
    keywords: ['ESTACION', 'PETROECUADOR', 'PETRO', 'GAS', 'UBER',
               'TAXI', 'CABIFY', 'GASOLINA', 'PARKING'],
  },
  {
    category: 'health',
    keywords: ['FARMACIA', 'FYBECA', 'MEDIC', 'CLINICA', 'HOSPITAL',
               'DENTAL', 'LABORAT', 'SALUD'],
  },
  {
    category: 'entertainment',
    keywords: ['NETFLIX', 'SPOTIFY', 'STEAM', 'APPLE', 'GOOGLE',
               'CINEMA', 'CINE', 'TEATRO', 'PLAYSTATION'],
  },
  {
    category: 'shopping',
    keywords: ['AMAZON', 'ZARA', 'H&M', 'AKI', 'MEGAMAXI',
               'CORAL', 'ETAFASHION', 'DE PRATI'],
  },
];

function categorize(merchant: string): string | null {
  const upper = merchant.toUpperCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => upper.includes(k))) {
      return rule.category;
    }
  }
  return null; // requiere revisión manual
}
```

---

## 4. API REST (Supabase Auto-generated)

Supabase genera automáticamente una API REST sobre PostgreSQL. El cliente la consume via el SDK de JS. Se documentan aquí los endpoints más relevantes.

### Base URL
```
https://<project-ref>.supabase.co/rest/v1
```

### Headers requeridos
```
apikey: <anon-key>
Authorization: Bearer <user-jwt>
Content-Type: application/json
```

---

### 4.1 Transacciones

**Listar transacciones del mes actual**
```
GET /transactions
  ?select=*
  &date=gte.2026-02-01T00:00:00Z
  &date=lte.2026-02-28T23:59:59Z
  &order=date.desc
```

**Listar con filtro de categoría y fuente**
```
GET /transactions
  ?select=*
  &category=eq.food
  &source=eq.produbanco
  &order=date.desc
```

**Crear transacción manual**
```
POST /transactions
Body: {
  "date": "2026-02-22T16:41:00-05:00",
  "amount": 28.89,
  "merchant": "ESTACION DE SERVICI",
  "source": "manual",
  "category": "transport",
  "notes": "Gasolina semana"
}
```

**Actualizar categoría o nota**
```
PATCH /transactions?id=eq.<uuid>
Body: {
  "category": "transport",
  "notes": "Actualizado"
}
```

---

### 4.2 Presupuestos

**Obtener presupuestos del mes**
```
GET /budgets
  ?month=eq.2
  &year=eq.2026
```

**Crear o actualizar presupuesto**
```
POST /budgets
Headers: Prefer: resolution=merge-duplicates
Body: {
  "month": 2,
  "year": 2026,
  "category": "food",
  "limit_amount": 350.00
}
```

---

### 4.3 Alertas

**Obtener alertas no leídas**
```
GET /alerts
  ?is_read=eq.false
  &order=triggered_at.desc
```

**Marcar alerta como leída**
```
PATCH /alerts?id=eq.<uuid>
Body: { "is_read": true }
```

---

### 4.4 Resumen mensual (RPC)

Para el dashboard se usa una función PostgreSQL para evitar múltiples roundtrips.

```sql
CREATE OR REPLACE FUNCTION get_monthly_summary(
  p_month INT,
  p_year  INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', COALESCE(SUM(amount), 0),
    'by_category', (
      SELECT json_object_agg(category, cat_total)
      FROM (
        SELECT category, SUM(amount) as cat_total
        FROM transactions
        WHERE user_id = auth.uid()
          AND EXTRACT(MONTH FROM date) = p_month
          AND EXTRACT(YEAR  FROM date) = p_year
          AND is_duplicate = FALSE
        GROUP BY category
      ) cat_sums
    ),
    'transaction_count', COUNT(*)
  ) INTO result
  FROM transactions
  WHERE user_id = auth.uid()
    AND EXTRACT(MONTH FROM date) = p_month
    AND EXTRACT(YEAR  FROM date) = p_year
    AND is_duplicate = FALSE;

  RETURN result;
END;
$$;
```

Llamada desde el cliente:
```
POST /rpc/get_monthly_summary
Body: { "p_month": 2, "p_year": 2026 }
```

---

## 5. Autenticación — Google OAuth 2.0

### Flujo en la app

```
1. Usuario toca "Conectar Gmail"
2. App llama: supabase.auth.signInWithOAuth({ provider: 'google' })
   con scopes: ['email', 'https://www.googleapis.com/auth/gmail.readonly']
3. Supabase redirige a Google consent screen
4. Usuario aprueba
5. Google retorna access_token + refresh_token a Supabase Auth
6. Supabase guarda tokens en auth.users y los expone via session
7. App almacena session localmente (manejado por Supabase JS SDK)
8. Edge Function gmail-poller lee tokens de gmail_tokens table
   para hacer polling server-side
```

### Configuración requerida en Google Cloud Console
- Crear proyecto en Google Cloud
- Habilitar Gmail API
- Crear OAuth 2.0 credentials (Web application)
- Agregar redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- Scopes requeridos: `gmail.readonly`

### Configuración requerida en Supabase Dashboard
- Auth > Providers > Google: ON
- Ingresar Client ID y Client Secret de Google Cloud
- Redirect URL ya configurada automáticamente por Supabase

---

## 6. Sincronización Cliente — Realtime

El cliente usa **Supabase Realtime** para recibir nuevas transacciones sin polling manual.

```typescript
// Suscripción a nuevas transacciones del usuario
const channel = supabase
  .channel('transactions')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'transactions',
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      // Insertar en WatermelonDB local
      syncTransactionToLocal(payload.new);
    }
  )
  .subscribe();
```

### Estrategia offline-first con WatermelonDB

```
App abre
  ↓
Cargar datos desde WatermelonDB (instantáneo, sin red)
  ↓
En paralelo: fetch de cambios desde Supabase
  ↓
Merge en WatermelonDB (upsert por id)
  ↓
UI se actualiza via observables de WatermelonDB
```

---

## 7. Estructura del Proyecto React Native

### Navegación

```
(auth)
  └── login.tsx                   # Pantalla de login / OAuth

(tabs)                            # 3 tabs principales
  ├── index.tsx                   # 🏠 Dashboard
  ├── transactions.tsx            # 📊 Transacciones
  └── settings.tsx                # ⚙️ Ajustes

Modales / Stacks sobre tabs
  ├── transaction/[id].tsx        # Detalle + edición (abre desde Transacciones)
  └── transaction/add.tsx         # Gasto manual (abre desde Transacciones, botón ➕)
```

**Flujo de navegación:**
- **Transacciones** tiene un botón ➕ en el header que abre `transaction/add.tsx` como modal.
- Tocar cualquier transacción de la lista abre `transaction/[id].tsx` como bottom sheet o modal.
- **Ajustes** contiene una sección de Alertas (lista de alertas + configuración de presupuestos) sin tab separado.

### Estructura de carpetas

```
fintrack/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/
│   │   └── login.tsx             # Pantalla de login / OAuth
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab bar config (3 tabs)
│   │   ├── index.tsx             # 🏠 Dashboard
│   │   ├── transactions.tsx      # 📊 Lista de transacciones
│   │   └── settings.tsx          # ⚙️ Ajustes (incluye sección Alertas)
│   └── transaction/
│       ├── [id].tsx              # Detalle / edición de transacción
│       └── add.tsx               # Formulario de gasto manual
│
├── components/                   # Componentes reutilizables
│   ├── TransactionCard.tsx
│   ├── CategoryBadge.tsx
│   ├── BudgetProgress.tsx
│   ├── MonthlyChart.tsx
│   ├── AlertCard.tsx
│   └── BottomSheet.tsx
│
├── db/                           # WatermelonDB
│   ├── index.ts                  # Instancia de la DB
│   ├── schema.ts                 # Schema local
│   └── models/
│       ├── Transaction.ts
│       ├── Budget.ts
│       └── Alert.ts
│
├── lib/
│   ├── supabase.ts               # Cliente Supabase configurado
│   ├── sync.ts                   # Lógica de sync Supabase ↔ WatermelonDB
│   └── export.ts                 # Lógica CSV / Excel
│
├── hooks/
│   ├── useTransactions.ts
│   ├── useBudgets.ts
│   └── useAlerts.ts
│
├── constants/
│   ├── categories.ts             # Labels, iconos, colores por categoría
│   └── colors.ts
│
└── supabase/
    ├── functions/
    │   ├── gmail-poller/
    │   │   └── index.ts
    │   ├── email-parser/
    │   │   └── index.ts
    │   └── alert-evaluator/
    │       └── index.ts
    └── migrations/
        └── 001_initial_schema.sql
```

---

## 8. Variables de Entorno

### App React Native (`.env`)
```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### Supabase Edge Functions (Supabase Dashboard > Secrets)
```
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

---

## 9. Consideraciones de Seguridad

- **RLS activado** en todas las tablas: ningún usuario puede acceder a datos de otro.
- **gmail.readonly scope únicamente:** la app nunca puede enviar, modificar ni eliminar emails.
- **Tokens OAuth almacenados en Supabase**, nunca en el dispositivo directamente.
- **raw_email_id** guardado para trazabilidad, pero el body del email no se persiste en la DB (solo se procesa en memoria dentro de la Edge Function).
- **Service Role Key** solo disponible en Edge Functions server-side, nunca expuesta al cliente.

---

*Este documento describe la arquitectura técnica de Fintrack v1.0. Cambios estructurales deben reflejarse aquí antes de implementarse.*
