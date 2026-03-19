import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

import type { AlertType } from '../../lib/database.types';

export class Alert extends Model {
  static override table = 'alerts';

  @field('remote_id') remoteId!: string | null;
  @field('user_id') userId!: string;
  @date('triggered_at') triggeredAt!: Date;
  @field('type') type!: AlertType;
  @field('category') category!: string | null;
  @field('transaction_id') transactionId!: string | null;
  @field('is_read') isRead!: boolean;
  @readonly @date('created_at') createdAt!: Date;
}
