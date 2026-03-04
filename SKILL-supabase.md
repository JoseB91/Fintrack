# SKILL — Supabase (Fintrack)
> Convenciones y patrones para todo código relacionado con Supabase en este proyecto.
> Leer completo antes de implementar cualquier tarea de backend.

---

## 1. Proyecto y credenciales

- Las credenciales viven **únicamente** en variables de entorno. Nunca hardcodear keys en código.
- Variables disponibles en la app: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Variables disponibles en Edge Functions (Supabase Secrets): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
- El `service role key` **nunca** va al cliente React Native. Solo Edge Functions server-side.

---

## 2. Migraciones SQL

### Naming
```
supabase/migrations/
  001_initial_schema.sql
  002_add_indexes.sql
  003_<descripcion_corta>.sql
```

### Reglas
- Siempre usar `IF NOT EXISTS` en CREATE TABLE y CREATE INDEX.
- Siempre incluir `created_at TIMESTAMPTZ DEFAULT NOW()` en todas las tablas.
- Siempre incluir `updated_at TIMESTAMPTZ DEFAULT NOW()` en tablas que se actualizan.
- PKs siempre son `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- FKs a usuarios siempre referencian `auth.users`, nunca una tabla `users` propia.
- Los CHECK constraints van inline en la definición de columna.

### Ejemplo de tabla correcta
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  date         TIMESTAMPTZ NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('produbanco', 'deuna', 'transfer', 'manual')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Ejecutar migraciones
```bash
supabase db push           # aplica migraciones pendientes
supabase db reset          # reset completo (solo dev)
supabase migration new <nombre>  # crea nueva migration
```

---

## 3. Row Level Security (RLS)

- **RLS siempre activado** en todas las tablas sin excepción.
- La política base para todas las tablas es: el usuario solo accede a sus propias filas via `auth.uid() = user_id`.
- Siempre habilitar RLS **antes** de crear políticas.
- Nombrar políticas de forma descriptiva: `"users_own_<tabla>"`.

### Patrón estándar
```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_<tabla>"
  ON <tabla> FOR ALL
  USING (auth.uid() = user_id);
```

### Verificar RLS en SQL Editor
```sql
-- Simular usuario específico para testear
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<user-uuid>"}';
SELECT * FROM transactions; -- debe retornar solo filas del usuario
```

---

## 4. Edge Functions (Deno)

### Estructura de cada función
```
supabase/functions/
  <nombre-funcion>/
    index.ts       # entry point, siempre este nombre
```

### Template base de Edge Function
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req: Request) => {
  try {
    // lógica aquí

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[<nombre-funcion>]', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

### Reglas de Edge Functions
- Siempre usar `SUPABASE_SERVICE_ROLE_KEY` (no anon key) para operaciones server-side.
- Siempre envolver en `try/catch` con logging del nombre de la función.
- Siempre retornar `Content-Type: application/json`.
- Imports siempre desde `https://esm.sh/` (CDN compatible con Deno).
- No usar `node:` imports — Deno runtime, no Node.

### Deploy y logs
```bash
supabase functions deploy <nombre>          # deploy individual
supabase functions deploy                   # deploy todas
supabase functions logs <nombre> --tail     # logs en tiempo real
```

---

## 5. Gmail API dentro de Edge Functions

### Refresh de access token
```typescript
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error}`)
  return data.access_token
}
```

### Obtener body de un email (text/plain)
```typescript
async function getEmailBody(
  accessToken: string,
  messageId: string
): Promise<string> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const msg = await res.json()

  // Buscar part text/plain, puede estar nested
  const findPlainText = (parts: any[]): string | null => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      if (part.parts) {
        const found = findPlainText(part.parts)
        if (found) return found
      }
    }
    return null
  }

  if (msg.payload?.body?.data) {
    return atob(msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
  }
  if (msg.payload?.parts) {
    return findPlainText(msg.payload.parts) ?? ''
  }
  return ''
}
```

### Rate limiting Gmail API
- Gmail API tiene límite de 250 quota units/segundo por usuario.
- Si la respuesta es 429 → esperar con backoff exponencial antes de reintentar.

```typescript
async function withBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000))
    }
  }
  throw new Error('Max retries reached')
}
```

---

## 6. Deduplicación de transacciones

Siempre calcular `raw_hash` antes de insertar:

```typescript
async function computeHash(
  userId: string,
  date: string,
  amount: number,
  merchant: string
): Promise<string> {
  const input = `${userId}:${date}:${amount}:${merchant.trim().toUpperCase()}`
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  )
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

Insert con deduplicación automática:
```typescript
const { error } = await supabase
  .from('transactions')
  .insert({ ...transactionData, raw_hash: hash })
  // ON CONFLICT (raw_hash) DO NOTHING — configurado en el schema
```

---

## 7. Cliente Supabase en React Native (`lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

---

## 8. Queries desde React Native

### Patrón estándar con manejo de error
```typescript
const { data, error } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', userId)
  .order('date', { ascending: false })

if (error) throw new Error(error.message)
```

### Llamar RPC
```typescript
const { data, error } = await supabase
  .rpc('get_monthly_summary', { p_month: 2, p_year: 2026 })

if (error) throw new Error(error.message)
```

### Realtime subscription
```typescript
const channel = supabase
  .channel('transactions-changes')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'transactions' },
    (payload) => handleNewTransaction(payload.new)
  )
  .subscribe()

// Cleanup obligatorio en useEffect return
return () => { supabase.removeChannel(channel) }
```

---

## 9. Checklist antes de hacer deploy de una Edge Function

- [ ] ¿Usa `SUPABASE_SERVICE_ROLE_KEY` y no el anon key?
- [ ] ¿Tiene `try/catch` con logging?
- [ ] ¿El INSERT de transacciones usa `raw_hash` para deduplicación?
- [ ] ¿El access token de Gmail se refresca si está por vencer?
- [ ] ¿Los errores de Gmail 429 tienen backoff?
- [ ] ¿Fue testeado con un body de email real?
