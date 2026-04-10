import { StyleSheet, View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useDashboard } from '@/hooks/useDashboard'
import { CATEGORIES } from '@/constants/categories'
import type { CategoryKey } from '@/constants/categories'

const NOW = new Date()

export default function DashboardScreen() {
  const { summary, recentTransactions, totalBudget, loading, error, refresh } = useDashboard(
    NOW.getMonth() + 1,
    NOW.getFullYear(),
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  const total = summary?.total ?? 0
  const budgetProgress = totalBudget ? Math.min(total / totalBudget, 1) : null
  const byCategory = summary?.by_category ?? {}

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.monthLabel}>
        {NOW.toLocaleString('es', { month: 'long', year: 'numeric' })}
      </Text>

      {/* Total del mes */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Total gastado</Text>
        <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>

        {budgetProgress !== null && (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${budgetProgress * 100}%`,
                    backgroundColor: budgetProgress >= 1 ? '#FF3B30' : '#007AFF',
                  },
                ]}
              />
            </View>
            <Text style={styles.budgetLabel}>
              ${total.toFixed(2)} de ${totalBudget!.toFixed(2)} presupuestado
            </Text>
          </>
        )}
      </View>

      {/* Breakdown por categoría */}
      {Object.keys(byCategory).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Por categoría</Text>
          {(Object.entries(byCategory) as [CategoryKey, number][])
            .sort(([, a], [, b]) => b - a)
            .map(([key, amount]) => {
              const cat = CATEGORIES[key]
              const pct = total > 0 ? (amount / total) * 100 : 0
              return (
                <View key={key} style={styles.categoryRow}>
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <View style={styles.categoryInfo}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryLabel}>{cat.label}</Text>
                      <Text style={styles.categoryAmount}>${amount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${pct}%`, backgroundColor: cat.color },
                        ]}
                      />
                    </View>
                    <Text style={styles.categoryPct}>{pct.toFixed(0)}%</Text>
                  </View>
                </View>
              )
            })}
        </View>
      )}

      {/* Últimas transacciones */}
      {recentTransactions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Últimas transacciones</Text>
          {recentTransactions.map((tx) => {
            const cat = tx.category ? CATEGORIES[tx.category] : null
            const date = new Date(tx.date)
            return (
              <View key={tx.id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: cat?.color ?? '#E0E0E0' }]}>
                  <Text style={styles.txIconText}>{cat?.icon ?? '📦'}</Text>
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
                  <Text style={styles.txDate}>
                    {date.toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <Text style={styles.txAmount}>-${tx.amount.toFixed(2)}</Text>
              </View>
            )
          })}
        </View>
      )}

      {summary?.transaction_count === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Sin transacciones este mes</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  monthLabel: {
    fontSize: 13,
    color: '#8E8E93',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  budgetLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  categoryIcon: {
    fontSize: 20,
    marginTop: 2,
  },
  categoryInfo: {
    flex: 1,
    gap: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryLabel: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  categoryPct: {
    fontSize: 11,
    color: '#8E8E93',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconText: {
    fontSize: 16,
  },
  txInfo: {
    flex: 1,
  },
  txMerchant: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  txDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
  },
})
