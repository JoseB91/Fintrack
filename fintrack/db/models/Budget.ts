import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class Budget extends Model {
  static override table = 'budgets';

  @field('remote_id') remoteId!: string | null;
  @field('user_id') userId!: string;
  @field('month') month!: number;
  @field('year') year!: number;
  @field('category') category!: string;
  @field('limit_amount') limitAmount!: number;
  @readonly @date('created_at') createdAt!: Date;
}
