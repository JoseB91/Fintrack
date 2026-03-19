import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { Transaction } from './models/Transaction';
import { Budget } from './models/Budget';
import { Alert } from './models/Alert';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'fintrack',
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Transaction, Budget, Alert],
});
