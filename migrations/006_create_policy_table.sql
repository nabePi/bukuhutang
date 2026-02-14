-- Policy table for runtime configuration (idempotent)
CREATE TABLE IF NOT EXISTS ops_policy (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default policies (ignore conflicts)
INSERT OR IGNORE INTO ops_policy (key, value) VALUES
  ('reminder.check_interval_hours', '6'),
  ('reminder.days_before_due', '3'),
  ('reminder.days_after_overdue', '1'),
  ('installment.check_interval_hours', '6'),
  ('installment.days_before_due', '3'),
  ('agreement.auto_activate', 'true'),
  ('system.max_retries', '3'),
  ('system.retry_delay_ms', '5000');
