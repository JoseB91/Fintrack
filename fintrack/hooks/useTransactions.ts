import { useEffect, useState, useCallback } from 'react'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/hooks'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/db/models/Transaction'
import type { CategoryKey, SourceKey } from '@/constants/categories'

export interface TransactionFilters {
  source: SourceKey | null
  category: CategoryKey | null
}

export interface GroupedTransactions {
  title: string
  data: Transaction[]
}

function getDateLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const d = new Date(date)
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return 'Hoy'
  }
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return 'Ayer'
  }
  return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
}

function groupByDate(transactions: Transaction[]): GroupedTransactions[] {
  const map = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const label = getDateLabel(tx.date)
    const group = map.get(label) ?? []
    group.push(tx)
    map.set(label, group)
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }))
}

async function syncTransactions(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('is_duplicate', false)
    .order('date', { ascending: false })
    .limit(200)

  if (error) throw error
  if (!data?.length) return

  // Import database lazily to avoid circular dependency
  const { database } = await import('@/db/index')

  await database.write(async () => {
    for (const item of data) {
      const existing = await database
        .get<Transaction>('transactions')
        .query(Q.where('remote_id', item.id))
        .fetch()

      if (existing.length > 0) {
        await existing[0].update(t => {
          t.category = item.category
          t.notes = item.notes
          t.updatedAt = new Date(item.updated_at)
        })
      } else {
        await database.get<Transaction>('transactions').create(t => {
          t.remoteId = item.id
          t.userId = item.user_id
          t.date = new Date(item.date)
          t.amount = item.amount
          t.merchant = item.merchant
          t.source = item.source
          t.category = item.category
          t.notes = item.notes
          t.isDuplicate = item.is_duplicate
          t.rawHash = item.raw_hash
          t.rawEmailId = item.raw_email_id
          t.updatedAt = new Date(item.updated_at)
        })
      }
    }
  })
}

interface UseTransactionsResult {
  grouped: GroupedTransactions[]
  loading: boolean
  error: string | null
  filters: TransactionFilters
  setFilters: (filters: TransactionFilters) => void
  refresh: () => void
}

export function useTransactions(): UseTransactionsResult {
  const database = useDatabase()
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [filters, setFilters] = useState<TransactionFilters>({ source: null, category: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 1. Reactive query desde WatermelonDB
  useEffect(() => {
    const conditions = [
      Q.where('is_duplicate', false),
      Q.sortBy('date', Q.desc),
    ]
    const subscription = database
      .get<Transaction>('transactions')
      .query(...conditions)
      .observe()
      .subscribe(setAllTransactions)

    return () => subscription.unsubscribe()
  }, [database])

  // 2. Sync al montar
  const sync = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    syncTransactions()
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error de sync') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return sync()
  }, [sync])

  // 3. Aplicar filtros en memoria
  const filtered = allTransactions.filter(tx => {
    if (filters.source && tx.source !== filters.source) return false
    if (filters.category && tx.category !== filters.category) return false
    return true
  })

  const grouped = groupByDate(filtered)

  return { grouped, loading, error, filters, setFilters, refresh: () => { sync() } }
}
