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

console.log('Migration completed successfully!');
