# SKILL — React Native (Fintrack)
> Convenciones y patrones para todo código React Native / Expo en este proyecto.
> Leer completo antes de implementar cualquier tarea de la app.

---

## 1. Stack y versiones

```
React Native    → vía Expo SDK 54 (React Native 0.81, React 19.1)
Expo Router     → v4 (file-based routing)
TypeScript      → strict mode activado
WatermelonDB    → @nozbe/watermelondb
Supabase JS     → @supabase/supabase-js v2
```

---

## 2. TypeScript

- `strict: true` en `tsconfig.json` siempre.
- No usar `any`. Si el tipo es desconocido, usar `unknown` y narrowing.
- Tipar todos los props de componentes con `interface`, no `type` para objetos.
- Tipar los retornos de hooks explícitamente.

### Ejemplo de prop typing
```typescript
interface TransactionCardProps {
  transaction: Transaction
  onPress: (id: string) => void
}

export function TransactionCard({ transaction, onPress }: TransactionCardProps) {
  // ...
}
```

---

## 3. Estructura de archivos

```
app/           → solo routing (Expo Router). Mínima lógica aquí.
components/    → componentes reutilizables, sin lógica de negocio
hooks/         → lógica de negocio, queries, estado
lib/           → utilidades, clientes externos (supabase, export)
db/            → WatermelonDB schema y modelos
constants/     → valores estáticos (categorías, colores, fuentes)
```

**Regla:** si un archivo en `app/` tiene más de 80 líneas, mover lógica a un hook.

---

## 4. Expo Router — Convenciones de navegación

### Estructura de tabs
```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="home" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transacciones',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="receipt" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="settings" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
```

### Navegar a modal
```typescript
import { router } from 'expo-router'

// Abrir modal de gasto manual
router.push('/transaction/add')

// Abrir detalle de transacción
router.push(`/transaction/${transaction.id}`)

// Cerrar modal
router.back()
```

### Leer params en pantalla
```typescript
import { useLocalSearchParams } from 'expo-router'

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  // ...
}
```

---

## 5. WatermelonDB — Modelos y queries

### Definición de modelo
```typescript
// db/models/Transaction.ts
import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export class Transaction extends Model {
  static table = 'transactions'

  @field('supabase_id')    supabaseId!: string
  @date('date')            date!: Date
  @field('amount')         amount!: number
  @field('merchant')       merchant!: string
  @field('source')         source!: string
  @field('category')       category!: string | null
  @field('notes')          notes!: string | null
  @readonly @date('created_at') createdAt!: Date
}
```

### Schema local
```typescript
// db/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'supabase_id', type: 'string', isIndexed: true },
        { name: 'date',        type: 'number' },
        { name: 'amount',      type: 'number' },
        { name: 'merchant',    type: 'string' },
        { name: 'source',      type: 'string' },
        { name: 'category',    type: 'string', isOptional: true },
        { name: 'notes',       type: 'string', isOptional: true },
        { name: 'created_at',  type: 'number' },
      ],
    }),
    tableSchema({
      name: 'budgets',
      columns: [
        { name: 'supabase_id',   type: 'string', isIndexed: true },
        { name: 'month',         type: 'number' },
        { name: 'year',          type: 'number' },
        { name: 'category',      type: 'string' },
        { name: 'limit_amount',  type: 'number' },
      ],
    }),
    tableSchema({
      name: 'alerts',
      columns: [
        { name: 'supabase_id',    type: 'string', isIndexed: true },
        { name: 'triggered_at',   type: 'number' },
        { name: 'type',           type: 'string' },
        { name: 'category',       type: 'string', isOptional: true },
        { name: 'is_read',        type: 'boolean' },
      ],
    }),
  ],
})
```

### Query desde componente (con observe para reactividad)
```typescript
import { useDatabase } from '@nozbe/watermelondb/hooks'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { Transaction } from '@/db/models/Transaction'

export function useTransactions(month: number, year: number) {
  const database = useDatabase()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const startDate = new Date(year, month - 1, 1).getTime()
    const endDate   = new Date(year, month, 0, 23, 59, 59).getTime()

    const subscription = database
      .get<Transaction>('transactions')
      .query(
        Q.where('date', Q.gte(startDate)),
        Q.where('date', Q.lte(endDate)),
        Q.sortBy('date', Q.desc),
      )
      .observe()
      .subscribe(setTransactions)

    return () => subscription.unsubscribe()
  }, [month, year])

  return transactions
}
```

---

## 6. Hooks — Patrón estándar

Todos los hooks siguen este patrón: datos locales inmediatos + sync en background.

```typescript
// hooks/useTransactions.ts
export function useTransactions(month: number, year: number) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // 1. Datos locales desde WatermelonDB (reactivo, instantáneo)
  const transactions = useLocalTransactions(month, year)

  // 2. Sync en background al montar
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    syncTransactions(month, year)
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [month, year])

  return { transactions, loading, error }
}
```

---

## 7. Componentes — Reglas

- Un componente por archivo.
- Nombre del archivo = nombre del componente (PascalCase).
- Usar `StyleSheet.create()` siempre, no inline styles.
- No hacer fetch de datos dentro de componentes. Los datos vienen por props o hooks.
- Componentes puros cuando sea posible (sin side effects).

### Estructura de componente
```typescript
import { StyleSheet, View, Text, Pressable } from 'react-native'

interface Props {
  // props aquí
}

export function MiComponente({ }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    // ...
  },
  text: {
    // ...
  },
})
```

---

## 8. Categorías — Fuente de verdad

Siempre importar de `constants/categories.ts`. Nunca hardcodear strings de categoría en componentes.

```typescript
// constants/categories.ts
export const CATEGORIES = {
  food:          { label: 'Comida',         icon: '🍽',  color: '#FF6B6B' },
  transport:     { label: 'Transporte',     icon: '⛽',  color: '#4ECDC4' },
  health:        { label: 'Salud',          icon: '💊',  color: '#45B7D1' },
  entertainment: { label: 'Entretenimiento',icon: '🎬',  color: '#96CEB4' },
  shopping:      { label: 'Compras',        icon: '🛍',  color: '#FFEAA7' },
  other:         { label: 'Otros',          icon: '📦',  color: '#DDA0DD' },
} as const

export type CategoryKey = keyof typeof CATEGORIES

export const SOURCES = {
  produbanco: { label: 'Produbanco', color: '#003087' },
  deuna:      { label: 'DeUna',      color: '#FF4500' },
  transfer:   { label: 'Transferencia', color: '#708090' },
  manual:     { label: 'Manual',     color: '#808080' },
} as const

export type SourceKey = keyof typeof SOURCES
```

---

## 9. Manejo de errores en pantallas

Siempre manejar tres estados: loading, error, data.

```typescript
if (loading) return <LoadingSkeleton />
if (error)   return <ErrorState message={error} onRetry={retry} />
if (!data.length) return <EmptyState message="No hay transacciones" />

return <ListaDeTransacciones data={data} />
```

---

## 10. Sync Supabase ↔ WatermelonDB (`lib/sync.ts`)

Patrón de upsert: Supabase siempre gana en caso de conflicto.

```typescript
export async function syncTransactions(month: number, year: number) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('date', `${year}-${String(month).padStart(2,'0')}-01`)
    .lte('date', `${year}-${String(month).padStart(2,'0')}-31`)

  if (error) throw error

  await database.write(async () => {
    for (const item of data) {
      const existing = await database
        .get<Transaction>('transactions')
        .query(Q.where('supabase_id', item.id))
        .fetch()

      if (existing.length > 0) {
        await existing[0].update(t => {
          t.category = item.category
          t.notes    = item.notes
        })
      } else {
        await database.get<Transaction>('transactions').create(t => {
          t.supabaseId = item.id
          t.date       = new Date(item.date).getTime()
          t.amount     = item.amount
          t.merchant   = item.merchant
          t.source     = item.source
          t.category   = item.category
          t.notes      = item.notes
        })
      }
    }
  })
}
```

---

## 11. Checklist antes de marcar una tarea como completada

- [ ] ¿TypeScript sin errores ni `any`?
- [ ] ¿El componente no hace fetch directamente (usa hook)?
- [ ] ¿Hay manejo de estados loading / error / empty?
- [ ] ¿Los strings de categoría vienen de `constants/categories.ts`?
- [ ] ¿WatermelonDB se actualiza localmente tras cada mutación?
- [ ] ¿Los useEffect tienen cleanup (cancelación o unsubscribe)?
- [ ] ¿Probado en iOS Simulator y Android Emulator?
