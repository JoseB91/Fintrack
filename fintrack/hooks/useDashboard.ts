import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { CategoryKey } from '@/constants/categories'

export interface MonthlySummary {
  total: number
  by_category: Partial<Record<CategoryKey, number>> | null
  transaction_count: number
}

export interface RecentTransaction {
  id: string
  date: string
  amount: number
  merchant: string
  source: string
  category: CategoryKey | null
}

interface DashboardState {
  summary: MonthlySummary | null
  recentTransactions: RecentTransaction[]
  totalBudget: number | null
  loading: boolean
  error: string | null
}

export function useDashboard(month: number, year: number): DashboardState & { refresh: () => void } {
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([])
  const [totalBudget, setTotalBudget] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [summaryResult, transactionsResult, budgetsResult] = await Promise.all([
        supabase.rpc('get_monthly_summary', { p_month: month, p_year: year }),
        supabase
          .from('transactions')
          .select('id, date, amount, merchant, source, category')
          .gte('date', `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`)
          .lte('date', `${year}-${String(month).padStart(2, '0')}-31T23:59:59Z`)
          .eq('is_duplicate', false)
          .order('date', { ascending: false })
          .limit(5),
        supabase
          .from('budgets')
          .select('limit_amount')
          .eq('month', month)
          .eq('year', year),
      ])

      if (summaryResult.error) throw summaryResult.error
      if (transactionsResult.error) throw transactionsResult.error
      if (budgetsResult.error) throw budgetsResult.error

      setSummary(summaryResult.data as MonthlySummary)
      setRecentTransactions((transactionsResult.data ?? []) as RecentTransaction[])

      const total = (budgetsResult.data ?? []).reduce(
        (acc, b) => acc + (b.limit_amount ?? 0),
        0,
      )
      setTotalBudget(total > 0 ? total : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  // Carga inicial
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime: nuevas transacciones del mes
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-${month}-${year}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => { fetchData() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [month, year, fetchData])

  return { summary, recentTransactions, totalBudget, loading, error, refresh: fetchData }
}
