import { StyleSheet, View, Text, Pressable } from 'react-native'
import { CATEGORIES, SOURCES } from '@/constants/categories'
import type { Transaction } from '@/db/models/Transaction'
import type { CategoryKey, SourceKey } from '@/constants/categories'

interface TransactionCardProps {
  transaction: Transaction
  onPress: (id: string) => void
}

export function TransactionCard({ transaction, onPress }: TransactionCardProps) {
  const cat = transaction.category ? CATEGORIES[transaction.category as CategoryKey] : null
  const source = SOURCES[transaction.source as SourceKey]
  const date = new Date(transaction.date)

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress(transaction.id)}
    >
      {/* Ícono de categoría */}
      <View style={[styles.iconWrapper, { backgroundColor: cat?.color ?? '#E5E5EA' }]}>
        <Text style={styles.icon}>{cat?.icon ?? '📦'}</Text>
      </View>

      {/* Info central */}
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>{transaction.merchant}</Text>
        <View style={styles.meta}>
          <View style={[styles.sourceBadge, { backgroundColor: source?.color ?? '#8E8E93' }]}>
            <Text style={styles.sourceLabel}>{source?.label ?? transaction.source}</Text>
          </View>
          {transaction.category && (
            <Text style={styles.category}>{cat?.label}</Text>
          )}
        </View>
      </View>

      {/* Monto */}
      <View style={styles.amountWrapper}>
        <Text style={styles.amount}>-${transaction.amount.toFixed(2)}</Text>
        <Text style={styles.time}>
          {date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  merchant: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  category: {
    fontSize: 12,
    color: '#8E8E93',
  },
  amountWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  time: {
    fontSize: 11,
    color: '#8E8E93',
  },
})
