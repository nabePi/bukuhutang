const { getConnection } = require('./connection');

function runMigrations(tenantId) {
  const db = getConnection(tenantId);
  
  // Create migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Get list of applied migrations
  const appliedStmt = db.prepare('SELECT name FROM _migrations');
  const applied = new Set(appliedStmt.all().map(m => m.name));
  
  // Define migrations
  const migrations = [
    {
      name: '001_create_users_table',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone_number TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `
    },
    {
      name: '002_create_debts_table',
      sql: `
        CREATE TABLE IF NOT EXISTS debts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          debtor_name TEXT NOT NULL,
          debtor_phone TEXT,
          amount REAL NOT NULL,
          description TEXT,
          due_date DATE NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `
    },
    {
      name: '003_create_loan_agreements_table',
      sql: `
        CREATE TABLE IF NOT EXISTS loan_agreements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lender_id INTEGER NOT NULL,
          borrower_name TEXT NOT NULL,
          borrower_phone TEXT,
          total_amount REAL NOT NULL,
          installment_amount REAL NOT NULL,
          installment_count INTEGER NOT NULL,
          interest_rate REAL,
          first_payment_date DATE,
          status TEXT DEFAULT 'draft',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lender_id) REFERENCES users(id)
        );
      `
    },
    {
      name: '004_create_installments_table',
      sql: `
        CREATE TABLE IF NOT EXISTS installments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agreement_id INTEGER NOT NULL,
          installment_number INTEGER NOT NULL,
          amount REAL NOT NULL,
          due_date DATE NOT NULL,
          status TEXT DEFAULT 'pending',
          paid_amount REAL DEFAULT 0,
          paid_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agreement_id) REFERENCES loan_agreements(id)
        );
      `
    },
    {
      name: '005_create_reminders_table',
      sql: `
        CREATE TABLE IF NOT EXISTS reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          debt_id INTEGER,
          installment_id INTEGER,
          reminder_date DATE NOT NULL,
          sent BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (debt_id) REFERENCES debts(id),
          FOREIGN KEY (installment_id) REFERENCES installments(id)
        );
      `
    }
  ];
  
  // Apply pending migrations
  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      console.log(`[Tenant ${tenantId}] Applying migration: ${migration.name}`);
      try {
        db.exec(migration.sql);
        const insertStmt = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
        insertStmt.run(migration.name);
      } catch (error) {
        console.error(`Error applying migration ${migration.name}:`, error);
        throw error;
      }
    }
  }
  
  console.log(`[Tenant ${tenantId}] Migrations complete. Applied: ${migrations.filter(m => !applied.has(m.name)).length}`);
}

module.exports = { runMigrations };
