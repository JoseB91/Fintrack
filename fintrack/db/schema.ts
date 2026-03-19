import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'remote_id', type: 'string', isOptional: true },
        { name: 'user_id', type: 'string' },
        { name: 'date', type: 'number' },
        { name: 'amount', type: 'number' },
        { name: 'merchant', type: 'string' },
        { name: 'source', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'is_duplicate', type: 'boolean' },
        { name: 'raw_hash', type: 'string', isOptional: true },
        { name: 'raw_email_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'budgets',
      columns: [
        { name: 'remote_id', type: 'string', isOptional: true },
        { name: 'user_id', type: 'string' },
        { name: 'month', type: 'number' },
        { name: 'year', type: 'number' },
        { name: 'category', type: 'string' },
        { name: 'limit_amount', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'alerts',
      columns: [
        { name: 'remote_id', type: 'string', isOptional: true },
        { name: 'user_id', type: 'string' },
        { name: 'triggered_at', type: 'number' },
        { name: 'type', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'transaction_id', type: 'string', isOptional: true },
        { name: 'is_read', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
