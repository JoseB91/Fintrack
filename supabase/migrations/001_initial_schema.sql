-- ─────────────────────────────────────────
-- Fintrack — Initial Schema
-- Migration: 001_initial_schema.sql
-- ─────────────────────────────────────────

-- ─────────────────────────────────────────
-- EXTENSIONES
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- TABLA: gmail_tokens
-- Almacena los tokens OAuth de Gmail por usuario
-- ─────────────────────────────────────────
CREATE TABLE gmail_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL UNIQUE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- TABLA: transactions
-- ─────────────────────────────────────────
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  date         TIMESTAMPTZ NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  merchant     TEXT NOT NULL,
  source       TEXT NOT NULL
                 CHECK (source IN ('produbanco', 'deuna', 'transfer', 'manual')),
  category     TEXT
                 CHECK (category IN (
                   'food', 'transport', 'health',
                   'entertainment', 'shopping', 'other', NULL
                 )),
  notes        TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  raw_hash     TEXT UNIQUE,   -- SHA256(date + amount + merchant + user_id)
  raw_email_id TEXT,          -- Gmail message ID, para trazabilidad
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_date
  ON transactions(user_id, date DESC);

CREATE INDEX idx_transactions_user_category
  ON transactions(user_id, category);

-- ─────────────────────────────────────────
-- TABLA: budgets
-- ─────────────────────────────────────────
CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  month        INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INT NOT NULL CHECK (year >= 2024),
  category     TEXT NOT NULL,
  limit_amount DECIMAL(10,2) NOT NULL CHECK (limit_amount > 0),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, month, year, category)
);

-- ─────────────────────────────────────────
-- TABLA: alerts
-- ─────────────────────────────────────────
CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users NOT NULL,
  triggered_at   TIMESTAMPTZ DEFAULT NOW(),
  type           TEXT NOT NULL
                   CHECK (type IN ('budget_80', 'budget_exceeded', 'unusual_spend')),
  category       TEXT,
  transaction_id UUID REFERENCES transactions ON DELETE SET NULL,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_unread
  ON alerts(user_id, is_read);

-- ─────────────────────────────────────────
-- TABLA: poller_state
-- Registra el último email procesado por usuario
-- para que el poller no reprocese emails
-- ─────────────────────────────────────────
CREATE TABLE poller_state (
  user_id          UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  last_history_id  TEXT,   -- Gmail historyId para polling incremental
  last_polled_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- Todo usuario solo puede ver y modificar sus propios datos
-- ─────────────────────────────────────────

-- Habilitar RLS en todas las tablas
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE poller_state    ENABLE ROW LEVEL SECURITY;

-- Políticas: el usuario solo accede a sus propias filas
CREATE POLICY "users_own_transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_budgets"
  ON budgets FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_alerts"
  ON alerts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_gmail_tokens"
  ON gmail_tokens FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_poller_state"
  ON poller_state FOR ALL
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- FUNCIÓN RPC: get_monthly_summary
-- Resumen mensual para el Dashboard
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_monthly_summary(
  p_month INT,
  p_year  INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', COALESCE(SUM(amount), 0),
    'by_category', (
      SELECT json_object_agg(category, cat_total)
      FROM (
        SELECT category, SUM(amount) as cat_total
        FROM transactions
        WHERE user_id = auth.uid()
          AND EXTRACT(MONTH FROM date) = p_month
          AND EXTRACT(YEAR  FROM date) = p_year
          AND is_duplicate = FALSE
        GROUP BY category
      ) cat_sums
    ),
    'transaction_count', COUNT(*)
  ) INTO result
  FROM transactions
  WHERE user_id = auth.uid()
    AND EXTRACT(MONTH FROM date) = p_month
    AND EXTRACT(YEAR  FROM date) = p_year
    AND is_duplicate = FALSE;

  RETURN result;
END;
$$;
