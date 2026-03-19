import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

import type { TransactionSource, TransactionCategory } from '../../lib/database.types';

export class Transaction extends Model {
  static override table = 'transactions';

  @field('remote_id') remoteId!: string | null;
  @field('user_id') userId!: string;
  @date('date') date!: Date;
  @field('amount') amount!: number;
  @field('merchant') merchant!: string;
  @field('source') source!: TransactionSource;
  @field('category') category!: TransactionCategory | null;
  @field('notes') notes!: string | null;
  @field('is_duplicate') isDuplicate!: boolean;
  @field('raw_hash') rawHash!: string | null;
  @field('raw_email_id') rawEmailId!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
