const { getConnection } = require('../src/db/connection');

const db = getConnection();

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    business_name TEXT,
    user_mode TEXT DEFAULT 'personal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Debts (piutang - orang utang ke user)
db.exec(`
  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    debtor_name TEXT NOT NULL,
    debtor_phone TEXT,
    amount INTEGER NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending',
    reminder_sent BOOLEAN DEFAULT 0,
    reminder_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Credits (hutang - user utang ke orang)
db.exec(`
  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    creditor_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Reminders log
db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    response TEXT
  );
`);

// Create indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_debts_due ON debts(due_date);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_debts_reminder ON debts(reminder_time);`);

// Loan agreements table
db.exec(`
  CREATE TABLE IF NOT EXISTS loan_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lender_id INTEGER NOT NULL,
    borrower_name TEXT NOT NULL,
    borrower_phone TEXT NOT NULL,
    borrower_id_number TEXT,
    borrower_address TEXT,
    total_amount INTEGER NOT NULL,
    interest_rate REAL DEFAULT 0,
    installment_amount INTEGER,
    installment_count INTEGER,
    first_payment_date DATE,
    payment_day INTEGER,
    income_source TEXT,
    monthly_income INTEGER,
    other_debts INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    agreement_pdf_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    signed_at DATETIME,
    FOREIGN KEY (lender_id) REFERENCES users(id)
  );
`);

// Installment payments table
db.exec(`
  CREATE TABLE IF NOT EXISTS installment_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agreement_id INTEGER NOT NULL,
    installment_number INTEGER,
    due_date DATE NOT NULL,
    amount INTEGER NOT NULL,
    paid_amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    paid_at DATETIME,
    reminder_sent BOOLEAN DEFAULT 0,
    FOREIGN KEY (agreement_id) REFERENCES loan_agreements(id)
  );
`);

// Loan agreement indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_agreements_lender ON loan_agreements(lender_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_agreements_status ON loan_agreements(status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_agreement ON installment_payments(agreement_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_due ON installment_payments(due_date);`);

// Policy table for OpenClaw config
db.exec(`
  CREATE TABLE IF NOT EXISTS ops_policy (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Default policies
db.exec(`
  INSERT OR IGNORE INTO ops_policy (key, value) VALUES
  ('reminder_check_interval', '5'),
  ('installment_check_interval', '1'),
  ('max_retry_attempts', '3'),
  ('whatsapp_rate_limit', '30'),
  ('batch_size', '50');
`);

console.log('Migration completed successfully!');
