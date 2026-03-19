export type TransactionSource = 'produbanco' | 'deuna' | 'transfer' | 'manual';
export type TransactionCategory =
  | 'food'
  | 'transport'
  | 'health'
  | 'entertainment'
  | 'shopping'
  | 'other';
export type AlertType = 'budget_80' | 'budget_exceeded' | 'unusual_spend';

export interface Database {
  public: {
    Tables: {
      transactions: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          amount: number;
          merchant: string;
          source: TransactionSource;
          category: TransactionCategory | null;
          notes: string | null;
          is_duplicate: boolean;
          raw_hash: string | null;
          raw_email_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['transactions']['Row'],
          'id' | 'created_at' | 'updated_at' | 'is_duplicate'
        > & {
          id?: string;
          is_duplicate?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          month: number;
          year: number;
          category: string;
          limit_amount: number;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['budgets']['Row'],
          'id' | 'created_at'
        > & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['budgets']['Insert']>;
      };
      alerts: {
        Row: {
          id: string;
          user_id: string;
          triggered_at: string;
          type: AlertType;
          category: string | null;
          transaction_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['alerts']['Row'],
          'id' | 'triggered_at' | 'created_at' | 'is_read'
        > & { id?: string; triggered_at?: string; created_at?: string; is_read?: boolean };
        Update: Partial<Database['public']['Tables']['alerts']['Insert']>;
      };
      gmail_tokens: {
        Row: {
          id: string;
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['gmail_tokens']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['gmail_tokens']['Insert']>;
      };
      poller_state: {
        Row: {
          user_id: string;
          last_history_id: string | null;
          last_polled_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['poller_state']['Row'],
          'last_polled_at'
        > & { last_polled_at?: string };
        Update: Partial<Database['public']['Tables']['poller_state']['Insert']>;
      };
    };
    Functions: {
      get_monthly_summary: {
        Args: { p_month: number; p_year: number };
        Returns: {
          total: number;
          by_category: Record<string, number> | null;
          transaction_count: number;
        };
      };
    };
  };
}
