import {
  StyleSheet,
  View,
  Text,
  SectionList,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { DatabaseProvider } from '@nozbe/watermelondb/hooks'
import { database } from '@/db/index'
import { useTransactions } from '@/hooks/useTransactions'
import { TransactionCard } from '@/components/TransactionCard'
import { CATEGORIES, SOURCES } from '@/constants/categories'
import type { CategoryKey, SourceKey } from '@/constants/categories'
import type { Transaction } from '@/db/models/Transaction'

const CATEGORY_FILTERS = Object.entries(CATEGORIES) as [CategoryKey, (typeof CATEGORIES)[CategoryKey]][]
const SOURCE_FILTERS = Object.entries(SOURCES) as [SourceKey, (typeof SOURCES)[SourceKey]][]

function TransactionsContent() {
  const { grouped, loading, error, filters, setFilters, refresh } = useTransactions()

  const toggleSource = (key: SourceKey) => {
    setFilters({ ...filters, source: filters.source === key ? null : key })
  }

  const toggleCategory = (key: CategoryKey) => {
    setFilters({ ...filters, category: filters.category === key ? null : key })
  }

  const handleCardPress = (id: string) => {
    router.push(`/transaction/${id}`)
  }

  if (loading && grouped.length === 0) {
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

  return (
    <View style={styles.container}>
      {/* Filtros: fuente */}
      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {SOURCE_FILTERS.map(([key, meta]) => {
            const active = filters.source === key
            return (
              <Pressable
                key={key}
                style={[styles.chip, active && { backgroundColor: meta.color }]}
                onPress={() => toggleSource(key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {meta.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Filtros: categoría */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {CATEGORY_FILTERS.map(([key, meta]) => {
            const active = filters.category === key
            return (
              <Pressable
                key={key}
                style={[styles.chip, active && { backgroundColor: meta.color }]}
                onPress={() => toggleCategory(key)}
              >
                <Text style={styles.chipIcon}>{meta.icon}</Text>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {meta.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Lista agrupada */}
      {grouped.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Sin transacciones</Text>
        </View>
      ) : (
        <SectionList
          sections={grouped}
          keyExtractor={(item: Transaction) => item.id}
          renderItem={({ item }: { item: Transaction }) => (
            <TransactionCard transaction={item} onPress={handleCardPress} />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true}
        />
      )}
    </View>
  )
}

export default function TransactionsScreen() {
  return (
    <DatabaseProvider database={database}>
      <TransactionsContent />
    </DatabaseProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  filtersWrapper: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  chipsRow: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#C6C6C8',
  },
  chipIcon: {
    fontSize: 12,
  },
  chipText: {
    fontSize: 13,
    color: '#1C1C1E',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sectionHeader: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C6C6C8',
    marginLeft: 68,
  },
  listContent: {
    paddingBottom: 32,
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
